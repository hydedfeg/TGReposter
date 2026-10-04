import { Router, type RequestHandler } from "express";
import {
  getCryptoPaymentRuntimeStatus,
  scanConfiguredCryptoPayments,
} from "../payments/paymentRuntime";

interface CryptoPaymentRouterDependencies {
  authMiddleware: RequestHandler;
  requireSuperAdmin: RequestHandler;
}

export function createCryptoPaymentRouter({
  authMiddleware,
  requireSuperAdmin,
}: CryptoPaymentRouterDependencies) {
  const router = Router();

  router.use(authMiddleware);
  router.use((req: any, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized. Please log in." });
    }
    return next();
  });
  router.use(requireSuperAdmin);

  router.get("/status", (_req, res) => {
    try {
      return res.json(getCryptoPaymentRuntimeStatus());
    } catch (error: any) {
      return res.status(503).json({
        code: "CRYPTO_PAYMENT_CONFIG_ERROR",
        error:
          typeof error?.message === "string"
            ? error.message
            : "Crypto payment configuration is invalid.",
      });
    }
  });

  router.post("/scan", async (_req, res) => {
    try {
      const result = await scanConfiguredCryptoPayments();
      return res.json(result);
    } catch (error: any) {
      console.error("Crypto payment scan failed:", {
        name: error?.name,
        message: error?.message,
      });
      return res.status(500).json({
        code: "CRYPTO_PAYMENT_SCAN_FAILED",
        error: "Crypto payment scan failed.",
      });
    }
  });

  return router;
}
