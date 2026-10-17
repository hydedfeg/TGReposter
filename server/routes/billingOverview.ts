import { Router, type RequestHandler } from "express";
import { ownerPrincipalForUser } from "../services/userPrincipalService";
import { getBillingOverview } from "../billing/billingOverviewService";
import { setEndOfTermCancellation, SubscriptionLifecycleError } from "../billing/subscriptionLifecycleService";
import { getPlanChangePreview, PlanChangePreviewError } from "../billing/planChangePreview";

/**
 * No checkout or mutation routes. The authenticated session is the ONLY
 * source for the billing owner. The response deliberately has no payment
 * address, API keys, invoice transaction hash or external customer ID.
 */
export function createBillingOverviewRouter(options: {
  authMiddleware: RequestHandler;
  loadOverview?: typeof getBillingOverview;
  hasDatabase?: () => boolean;
  setCancellation?: typeof setEndOfTermCancellation;
  canManage?: () => boolean;
  previewChange?: typeof getPlanChangePreview;
  canPreview?: () => boolean;
}) {
  const router = Router();
  const load = options.loadOverview ?? getBillingOverview;
  const hasDatabase = options.hasDatabase ?? (() => Boolean(process.env.DATABASE_URL?.trim()));
  const manage = options.setCancellation ?? setEndOfTermCancellation;
  const canManage = options.canManage ?? (() => process.env.TGREPOSTER_SUBSCRIPTION_MANAGEMENT_ENABLED === "true");
  const previewChange = options.previewChange ?? getPlanChangePreview;
  const canPreview = options.canPreview ?? (() => process.env.TGREPOSTER_PLAN_CHANGE_PREVIEW_ENABLED === "true");

  router.use(options.authMiddleware);
  router.get("/overview", async (req: any, res) => {
    res.set("Cache-Control", "private, no-store");
    res.set("Vary", "Authorization");
    if (!req.user) {
      return res.status(401).json({
        code: "BILLING_AUTH_REQUIRED",
        error: "An authenticated account is required."
      });
    }
    if (!hasDatabase()) {
      return res.status(503).json({
        code: "BILLING_NOT_READY",
        error: "Customer billing information is not available yet."
      });
    }

    try {
      const owner = ownerPrincipalForUser(req.user);
      const overview = await load(owner);
      return res.json({ overview });
    } catch (error: any) {
      // On production and staging the commercial migrations are not live
      // yet. A missing table should yield a clear not-launched state; other
      // database problems must not be mistaken for an empty Free balance.
      if (error?.code === "42P01" || error?.code === "42703") {
        return res.status(503).json({
          code: "BILLING_NOT_READY",
          error: "The billing dashboard is being prepared."
        });
      }
      console.error("Owner billing overview failed:", { code: error?.code ?? "UNEXPECTED" });
      return res.status(503).json({
        code: "BILLING_UNAVAILABLE",
        error: "Billing information could not be loaded."
      });
    }
  });

  // This only estimates an internal pricing difference; it NEVER produces
  // an executable quote, subscription change, payment or refund.
  router.get("/subscription/change-preview", async (req: any, res) => {
    res.set("Cache-Control","private, no-store");
    res.set("Vary","Authorization");
    if(!req.user) {
      return res.status(401).json({code:"BILLING_AUTH_REQUIRED",error:"Sign in required."});
    }
    if(!canPreview() || !hasDatabase()) {
      return res.status(503).json({
        code:"PLAN_CHANGE_PREVIEW_DISABLED",error:"Plan change estimates are not available yet."
      });
    }
    const keys=Object.keys(req.query??{});
    if(keys.length!==1 || keys[0]!=="targetPlanId"
       || typeof req.query.targetPlanId!=="string"
       || req.query.targetPlanId.length>40) {
      return res.status(400).json({
        code:"INVALID_TARGET_PLAN",error:"Provide a targetPlanId only."
      });
    }
    try {
      const owner=ownerPrincipalForUser(req.user);
      const preview=await previewChange(owner,req.query.targetPlanId);
      return res.json({preview});
    } catch(error:any) {
      if(error?.code==="42P01" || error?.code==="42703") {
        return res.status(503).json({code:"BILLING_NOT_READY",error:"Billing schema is not ready."});
      }
      if(error instanceof PlanChangePreviewError) {
        const status=error.code==="PREVIEW_DISABLED"?503
          : error.code==="INVALID_TARGET_PLAN"?400:409;
        return res.status(status).json({code:error.code,error:error.message});
      }
      console.error("Plan change preview failed:",{code:error?.code??"UNEXPECTED_ERROR"});
      return res.status(503).json({code:"BILLING_UNAVAILABLE",error:"Plan change preview unavailable."});
    }
  });

  // Disabled by default. Financially safe status change only: no charges,
  // refunds, instant entitlement reduction, or new subscriptions.
  router.post("/subscription/cancellation", async (req: any, res) => {
    res.set("Cache-Control", "private, no-store");
    res.set("Vary", "Authorization");
    if (!req.user) {
      return res.status(401).json({code:"BILLING_AUTH_REQUIRED",error:"Sign in required."});
    }
    if (!canManage() || !hasDatabase()) {
      return res.status(503).json({code:"BILLING_MANAGEMENT_DISABLED",error:"Subscription management is not available yet."});
    }
    const body = req.body;
    if (!body || typeof body !== "object" ||
        typeof body.cancelAtPeriodEnd !== "boolean" ||
        Object.keys(body).some(key => key !== "cancelAtPeriodEnd")) {
      return res.status(400).json({
        code:"INVALID_CANCELLATION_REQUEST",
        error:"Provide only cancelAtPeriodEnd as a boolean."
      });
    }
    try {
      const owner = ownerPrincipalForUser(req.user);
      const result = await manage(owner,body.cancelAtPeriodEnd);
      return res.json({ cancellation:result });
    } catch (error: any) {
      if (error?.code === "42P01" || error?.code === "42703") {
        return res.status(503).json({code:"BILLING_NOT_READY",error:"Billing schema is not ready."});
      }
      if (error instanceof SubscriptionLifecycleError) {
        const status = error.code === "MANAGEMENT_DISABLED" ? 503
          : error.code === "INVALID_ACTION" ? 400 : 409;
        return res.status(status).json({code:error.code,error:error.message});
      }
      console.error("Subscription cancellation failed:",{code:error?.code??"UNEXPECTED"});
      return res.status(503).json({code:"BILLING_UNAVAILABLE",error:"Subscription management temporarily unavailable."});
    }
  });

  return router;
}
