import { Router, type RequestHandler } from "express";
import { CRYPTO_PAYMENT_NETWORKS } from "../payments/types";
import {
  getCryptoPaymentRuntimeStatus,
} from "../payments/paymentRuntime";
import { runCryptoPaymentScanWithAdvisoryLock } from "../payments/paymentScheduler";
import { CryptoPaymentInvoiceService } from "../payments/invoiceService";
import { ownerPrincipalForUser } from "../services/userPrincipalService";
import type { CryptoPaymentInvoiceRecord } from "../repositories/cryptoPaymentRepository";

interface CryptoPaymentRouterDependencies {
  authMiddleware: RequestHandler;
  requireSuperAdmin: RequestHandler;
}

function serializeInvoice(invoice: CryptoPaymentInvoiceRecord) {
  return {
    id: invoice.id,
    asset: invoice.asset_code,
    network: invoice.network,
    amount: invoice.expected_amount,
    receivingAddress: invoice.receiving_address,
    tokenIdentifier: invoice.token_identifier,
    status: invoice.status,
    expiresAt: invoice.expires_at,
    detectedAt: invoice.detected_at,
    confirmedAt: invoice.confirmed_at,
    cancelledAt: invoice.cancelled_at,
    createdAt: invoice.created_at,
    updatedAt: invoice.updated_at,
  };
}

function isPaymentNetwork(
  value: unknown
): value is (typeof CRYPTO_PAYMENT_NETWORKS)[number] {
  return (
    typeof value === "string" &&
    CRYPTO_PAYMENT_NETWORKS.includes(
      value as (typeof CRYPTO_PAYMENT_NETWORKS)[number]
    )
  );
}

function cleanNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim();
  return cleaned ? cleaned : null;
}

export function createCryptoPaymentRouter({
  authMiddleware,
  requireSuperAdmin,
}: CryptoPaymentRouterDependencies) {
  const router = Router();
  const invoiceService = new CryptoPaymentInvoiceService();

  router.use(authMiddleware);
  router.use((req: any, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized. Please log in." });
    }
    return next();
  });

  // Until pricing/entitlements are designed, every payment infrastructure
  // operation stays super-admin-only. A later customer checkout API should call
  // the same invoice service rather than duplicating blockchain logic.
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
      const execution = await runCryptoPaymentScanWithAdvisoryLock();
      if (!execution.acquired) {
        return res.status(409).json({
          code: "CRYPTO_PAYMENT_SCAN_IN_PROGRESS",
          error: "A crypto payment scan is already in progress.",
        });
      }

      return res.json(
        execution.result ?? {
          enabled: false,
          networks: [],
        }
      );
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

  router.post("/invoices", async (req: any, res) => {
    const network = req.body?.network;
    const baseAmount = cleanNonEmptyString(req.body?.baseAmount);
    const expiresAt = cleanNonEmptyString(req.body?.expiresAt);

    if (!isPaymentNetwork(network) || !baseAmount || !expiresAt) {
      return res.status(400).json({
        code: "CRYPTO_PAYMENT_INVOICE_INPUT_INVALID",
        error:
          "network, baseAmount, and expiresAt are required for a payment invoice.",
      });
    }

    if (!process.env.DATABASE_URL) {
      return res.status(503).json({
        code: "CRYPTO_PAYMENT_DATABASE_UNAVAILABLE",
        error: "Crypto payment invoices require the normalized database backend.",
      });
    }

    try {
      const ownerPrincipal = ownerPrincipalForUser(req.user);
      const invoice = await invoiceService.createInvoice(ownerPrincipal, {
        network,
        baseAmount,
        expiresAt,
      });

      return res.status(201).json({
        invoice: serializeInvoice(invoice),
      });
    } catch (error: any) {
      const message =
        typeof error?.message === "string"
          ? error.message
          : "Crypto payment invoice could not be created.";

      const status =
        /not enabled|configuration|requires|missing/i.test(message)
          ? 503
          : 400;

      return res.status(status).json({
        code:
          status === 503
            ? "CRYPTO_PAYMENT_CONFIG_ERROR"
            : "CRYPTO_PAYMENT_INVOICE_CREATE_FAILED",
        error: message,
      });
    }
  });

  router.get("/invoices/:id", async (req: any, res) => {
    try {
      const ownerPrincipal = ownerPrincipalForUser(req.user);
      const invoice = await invoiceService.getInvoice(
        ownerPrincipal,
        String(req.params.id ?? "")
      );

      if (!invoice) {
        return res.status(404).json({
          code: "CRYPTO_PAYMENT_INVOICE_NOT_FOUND",
          error: "Crypto payment invoice not found.",
        });
      }

      return res.json({
        invoice: serializeInvoice(invoice),
      });
    } catch (error: any) {
      return res.status(400).json({
        code: "CRYPTO_PAYMENT_INVOICE_READ_FAILED",
        error:
          typeof error?.message === "string"
            ? error.message
            : "Crypto payment invoice could not be read.",
      });
    }
  });

  router.post("/invoices/:id/cancel", async (req: any, res) => {
    try {
      const ownerPrincipal = ownerPrincipalForUser(req.user);
      const invoice = await invoiceService.cancelInvoice(
        ownerPrincipal,
        String(req.params.id ?? "")
      );

      if (!invoice) {
        return res.status(404).json({
          code: "CRYPTO_PAYMENT_INVOICE_NOT_FOUND",
          error: "Crypto payment invoice not found.",
        });
      }

      return res.json({
        invoice: serializeInvoice(invoice),
      });
    } catch (error: any) {
      return res.status(409).json({
        code: "CRYPTO_PAYMENT_INVOICE_CANCEL_FAILED",
        error:
          typeof error?.message === "string"
            ? error.message
            : "Crypto payment invoice could not be cancelled.",
      });
    }
  });

  return router;
}
