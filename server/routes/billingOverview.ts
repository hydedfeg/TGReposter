import { Router, type RequestHandler } from "express";
import { ownerPrincipalForUser } from "../services/userPrincipalService";
import { getBillingOverview } from "../billing/billingOverviewService";

/**
 * No checkout or mutation routes. The authenticated session is the ONLY
 * source for the billing owner. The response deliberately has no payment
 * address, API keys, invoice transaction hash or external customer ID.
 */
export function createBillingOverviewRouter(options: {
  authMiddleware: RequestHandler;
  loadOverview?: typeof getBillingOverview;
  hasDatabase?: () => boolean;
}) {
  const router = Router();
  const load = options.loadOverview ?? getBillingOverview;
  const hasDatabase = options.hasDatabase ?? (() => Boolean(process.env.DATABASE_URL?.trim()));

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

  return router;
}
