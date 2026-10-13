import { Router, type RequestHandler } from "express";
import { ownerPrincipalForUser } from "../services/userPrincipalService";
import { CheckoutQuoteError } from "../billing/checkoutQuoteService";
import { SubscriptionCheckoutError } from "../billing/subscriptionCheckoutService";
import {
  CustomerCheckoutError, isCustomerCheckoutEnabled,
  getCustomerCheckoutCatalog, createCustomerSubscriptionQuote,
  createCustomerSubscriptionOrder, getCustomerCheckoutOrder
} from "../billing/customerCheckoutService";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Dependencies = {
  authMiddleware: RequestHandler;
  hasDatabase?: () => boolean;
  enabled?: () => boolean;
  catalog?: typeof getCustomerCheckoutCatalog;
  quote?: typeof createCustomerSubscriptionQuote;
  createOrder?: typeof createCustomerSubscriptionOrder;
  readOrder?: typeof getCustomerCheckoutOrder;
};

function exactBody(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const present = Object.keys(value);
  return present.length === keys.length && keys.every(k => present.includes(k));
}

function knownError(error: unknown): {status:number;code:string;message:string} {
  if (error instanceof CustomerCheckoutError ||
      error instanceof CheckoutQuoteError ||
      error instanceof SubscriptionCheckoutError) {
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

  router.use(deps.authMiddleware);
  router.use((req:any,res,next) => {
    res.set("Cache-Control","private, no-store");
    res.set("Vary","Authorization");
    if (!req.user) return res.status(401).json({code:"BILLING_AUTH_REQUIRED",error:"Sign in required."});
    return next();
  });

  router.get("/status",async (_req,res) => {
    if (!enabled() || !hasDatabase()) return res.json({enabled:false,plans:[],networks:[]});
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
      const result = await quote(ownerPrincipalForUser(req.user),req.body.planId,req.body.interval);
      return res.status(201).json({quote:{
        id:result.id,product:result.product,eurCents:result.eurCents,
        usdtAmount:result.usdtAmount,expiresAt:result.expiresAt,
        rateSource:result.rateSource
      }});
    }catch(error){const fail=knownError(error);return res.status(fail.status).json({code:fail.code,error:fail.message});}
  });

  router.post("/orders",async (req:any,res) => {
    if (!enabled() || !hasDatabase()) return res.status(503).json({code:"CHECKOUT_DISABLED",error:"Checkout is not available yet."});
    if (!exactBody(req.body,["quoteId","network"]) ||
        typeof req.body.quoteId !== "string" || !UUID.test(req.body.quoteId) ||
        !["bsc","ethereum","ton"].includes(req.body.network)) {
      return res.status(400).json({code:"INVALID_CHECKOUT_INPUT",error:"Choose a valid quote and network."});
    }
    try {
      const order = await createOrder(ownerPrincipalForUser(req.user),req.body.quoteId,req.body.network);
      return res.status(201).json({order});
    }catch(error){const fail=knownError(error);return res.status(fail.status).json({code:fail.code,error:fail.message});}
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
