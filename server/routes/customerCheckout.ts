import { Router, type RequestHandler } from "express";
import { ownerPrincipalForUser } from "../services/userPrincipalService";
import { CheckoutQuoteError } from "../billing/checkoutQuoteService";
import { SubscriptionCheckoutError } from "../billing/subscriptionCheckoutService";
import { AITopupError } from "../billing/aiTopupService";
import { checkCustomerCheckoutRate,CheckoutRateLimitError,
  type CheckoutRateAction } from "../billing/checkoutRateLimit";
import {
  CustomerCheckoutError, isCustomerCheckoutEnabled, isTopupCheckoutEnabled,
  getCustomerCheckoutCatalog, createCustomerSubscriptionQuote,
  createCustomerSubscriptionOrder, getCustomerCheckoutOrder,
  createCustomerTopupQuote, createCustomerTopupOrder
} from "../billing/customerCheckoutService";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Dependencies = {
  authMiddleware: RequestHandler;
  hasDatabase?: () => boolean;
  enabled?: () => boolean;
  catalog?: typeof getCustomerCheckoutCatalog;
  quote?: typeof createCustomerSubscriptionQuote;
  createOrder?: typeof createCustomerSubscriptionOrder;
  topupsEnabled?: () => boolean;
  topupQuote?: typeof createCustomerTopupQuote;
  topupOrder?: typeof createCustomerTopupOrder;
  readOrder?: typeof getCustomerCheckoutOrder;
  checkBudget?: (ownerPrincipal:string,action:CheckoutRateAction)=>Promise<void>;
};

function exactBody(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const present = Object.keys(value);
  return present.length === keys.length && keys.every(k => present.includes(k));
}

function knownError(error: unknown): {status:number;code:string;message:string} {
  if (error instanceof CheckoutRateLimitError) {
    return {status:429,code:error.code,message:error.message};
  }
  if (error instanceof CustomerCheckoutError ||
      error instanceof CheckoutQuoteError ||
      error instanceof SubscriptionCheckoutError ||
      error instanceof AITopupError) {
    const code = error.code;
    const status = /DISABLED|UNAVAILABLE|NOT_LAUNCHED|NOT_READY/.test(code) ? 503
      : /INVALID_PRODUCT|INVALID_OWNER/.test(code) ? 400 : 409;
    return {status,code,message:"This checkout operation cannot be completed. Refresh your quote or contact support."};
  }
  if (error && typeof error==="object" && "code" in error &&
      ["42P01","42703"].includes(String((error as {code?:unknown}).code))) {
    return {status:503,code:"BILLING_NOT_READY",message:"Billing schema is not ready."};
  }
  return {status:503,code:"CHECKOUT_UNAVAILABLE",message:"Checkout is temporarily unavailable."};
}

/** Authenticated, private customer checkout. Mutations remain disabled by default. */
export function createCustomerCheckoutRouter(deps: Dependencies) {
  const router = Router();
  const hasDatabase = deps.hasDatabase ?? (() => Boolean(process.env.DATABASE_URL?.trim()));
  const enabled = deps.enabled ?? isCustomerCheckoutEnabled;
  const catalog = deps.catalog ?? getCustomerCheckoutCatalog;
  const quote = deps.quote ?? createCustomerSubscriptionQuote;
  const createOrder = deps.createOrder ?? createCustomerSubscriptionOrder;
  const readOrder = deps.readOrder ?? getCustomerCheckoutOrder;
  const topupsEnabled = deps.topupsEnabled ?? isTopupCheckoutEnabled;
  const topupQuote = deps.topupQuote ?? createCustomerTopupQuote;
  const topupOrder = deps.topupOrder ?? createCustomerTopupOrder;
  const checkBudget = deps.checkBudget ?? checkCustomerCheckoutRate;

  router.use(deps.authMiddleware);
  router.use((req:any,res,next) => {
    res.set("Cache-Control","private, no-store");
    res.set("Vary","Authorization");
    if (!req.user) return res.status(401).json({code:"BILLING_AUTH_REQUIRED",error:"Sign in required."});
    return next();
  });

  function respondMutationFailure(error:unknown,res:any){
    const fail=knownError(error);
    if(error instanceof CheckoutRateLimitError)
      res.set("Retry-After",String(error.retryAfterSeconds));
    return res.status(fail.status).json({code:fail.code,error:fail.message});
  }

  router.get("/status",async (_req,res) => {
    if (!hasDatabase())return res.json({enabled:false,topupsEnabled:false,plans:[],packs:[],networks:[]});
    try { return res.json(await catalog()); }
    catch (_error) { return res.status(503).json({code:"CHECKOUT_UNAVAILABLE",error:"Checkout is temporarily unavailable."}); }
  });

  router.post("/quotes",async (req:any,res) => {
    if (!enabled() || !hasDatabase()) return res.status(503).json({code:"CHECKOUT_DISABLED",error:"Checkout is not available yet."});
    if (!exactBody(req.body,["planId","interval"]) ||
        typeof req.body.planId !== "string" || req.body.planId.length > 40 ||
        !["monthly","annual"].includes(req.body.interval)) {
      return res.status(400).json({code:"INVALID_CHECKOUT_INPUT",error:"Choose a valid plan and interval."});
    }
    try {
      const owner=ownerPrincipalForUser(req.user);
      await checkBudget(owner,"quote");
      const result = await quote(owner,req.body.planId,req.body.interval);
      return res.status(201).json({quote:{
        id:result.id,product:result.product,eurCents:result.eurCents,
        usdtAmount:result.usdtAmount,expiresAt:result.expiresAt,
        rateSource:result.rateSource
      }});
    }catch(error){return respondMutationFailure(error,res);}
  });

  router.post("/orders",async (req:any,res) => {
    if (!enabled() || !hasDatabase()) return res.status(503).json({code:"CHECKOUT_DISABLED",error:"Checkout is not available yet."});
    if (!exactBody(req.body,["quoteId","network"]) ||
        typeof req.body.quoteId !== "string" || !UUID.test(req.body.quoteId) ||
        !["bsc","ethereum","ton"].includes(req.body.network)) {
      return res.status(400).json({code:"INVALID_CHECKOUT_INPUT",error:"Choose a valid quote and network."});
    }
    try {
      const owner=ownerPrincipalForUser(req.user);
      await checkBudget(owner,"invoice");
      const order = await createOrder(owner,req.body.quoteId,req.body.network);
      return res.status(201).json({order});
    }catch(error){return respondMutationFailure(error,res);}
  });

  router.post("/topups/quotes",async (req:any,res) => {
    if (!enabled()||!topupsEnabled()||!hasDatabase())
      return res.status(503).json({code:"TOPUPS_DISABLED",error:"AI Unit top-ups are not available yet."});
    if (!exactBody(req.body,["packId"])||
        typeof req.body.packId!=="string"||req.body.packId.length>40) {
      return res.status(400).json({code:"INVALID_CHECKOUT_INPUT",error:"Choose a valid AI pack."});
    }
    try {
      const owner=ownerPrincipalForUser(req.user);
      await checkBudget(owner,"quote");
      const result=await topupQuote(owner,req.body.packId);
      return res.status(201).json({quote:{
        id:result.id,product:result.product,eurCents:result.eurCents,
        usdtAmount:result.usdtAmount,expiresAt:result.expiresAt,rateSource:result.rateSource
      }});
    }catch(error){return respondMutationFailure(error,res);}
  });

  router.post("/topups/orders",async (req:any,res) => {
    if (!enabled()||!topupsEnabled()||!hasDatabase())
      return res.status(503).json({code:"TOPUPS_DISABLED",error:"AI Unit top-ups are not available yet."});
    if (!exactBody(req.body,["quoteId","network"])||
        typeof req.body.quoteId!=="string"||!UUID.test(req.body.quoteId)||
        !["bsc","ethereum","ton"].includes(req.body.network)) {
      return res.status(400).json({code:"INVALID_CHECKOUT_INPUT",error:"Choose a valid quote and network."});
    }
    try {
      const owner=ownerPrincipalForUser(req.user);
      await checkBudget(owner,"invoice");
      const order=await topupOrder(owner,req.body.quoteId,req.body.network);
      return res.status(201).json({order});
    }catch(error){return respondMutationFailure(error,res);}
  });

  // Read-only status continues to work for existing orders after checkout is disabled.
  router.get("/orders/:id",async (req:any,res) => {
    if (!hasDatabase()) return res.status(503).json({code:"BILLING_NOT_READY",error:"Billing is not available."});
    if (!UUID.test(String(req.params.id??""))) return res.status(400).json({code:"INVALID_ORDER_ID",error:"Invalid order identifier."});
    try {
      const order=await readOrder(ownerPrincipalForUser(req.user),String(req.params.id));
      if (!order) return res.status(404).json({code:"ORDER_NOT_FOUND",error:"Order not found."});
      return res.json({order});
    } catch (_error) {
      return res.status(503).json({code:"CHECKOUT_UNAVAILABLE",error:"Order status is temporarily unavailable."});
    }
  });

  return router;
}
