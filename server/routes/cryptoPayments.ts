import { Router, type RequestHandler } from "express";
import { CRYPTO_PAYMENT_NETWORKS } from "../payments/types";
import { loadCryptoPaymentOverview } from "../payments/paymentOverview";
import {
  getPaymentNotificationStatus,
  sendPaymentNotificationTest,
} from "../payments/paymentNotificationTest";
import {
  getCryptoPaymentRuntimeStatus,
  preflightConfiguredCryptoPayments,
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
    requestedAmount: invoice.requested_amount,
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

  router.get("/overview", async (_req, res) => {
    if (!process.env.DATABASE_URL?.trim()) {
      return res.status(503).json({
        code: "CRYPTO_PAYMENT_DATABASE_UNAVAILABLE",
        error: "Payment monitoring requires the normalized database backend.",
      });
    }

    try {
      return res.json(await loadCryptoPaymentOverview());
    } catch (error: any) {
      console.error("Crypto payment overview failed:", {
        name: error?.name,
        code: error?.code,
      });
      return res.status(503).json({
        code: "CRYPTO_PAYMENT_OVERVIEW_FAILED",
        error: "Payment overview is temporarily unavailable.",
      });
    }
  });

  router.get("/notifications/status", (_req, res) => {
    return res.json(getPaymentNotificationStatus());
  });

  router.post("/notifications/test", async (_req, res) => {
    const result = await sendPaymentNotificationTest();
    if (result.ok) return res.json(result);
    // Log only the controlled diagnostic code; never the token, chat ID,
    // raw Telegram response, request URL or payment data.
    console.warn("Payment alert notification test failed:", { code: result.code });
    const errors: Record<string, string> = {
      TEST_RATE_LIMITED: "Please wait 60 seconds before testing again.",
      TEST_UNAVAILABLE: "Telegram test delivery is not fully configured.",
      TEST_INVALID_BOT_TOKEN: "Telegram rejected the bot token. Check the dedicated bot token in Railway.",
      TEST_CHAT_NOT_FOUND: "Telegram could not find the chat. Verify its numeric Chat ID and start the bot or add it to the group.",
      TEST_CHAT_FORBIDDEN: "The bot is blocked or no longer has access to this chat. Start or unblock it, or add it to the group.",
      TEST_NO_SEND_PERMISSION: "The bot cannot send messages to this chat. Grant it permission to post.",
      TEST_CHAT_MIGRATED: "The group has moved to a supergroup. Update Railway with its new -100 Chat ID.",
      TEST_TELEGRAM_RATE_LIMITED: "Telegram temporarily limited requests. Wait and try again.",
      TEST_TELEGRAM_UNAVAILABLE: "Telegram's API is temporarily unavailable. Try again later.",
      TEST_CONNECTION_TIMEOUT: "Telegram did not respond within 8 seconds. Check outbound network connectivity.",
      TEST_NETWORK_ERROR: "The server could not connect to Telegram. Check network or DNS access.",
      TEST_DELIVERY_FAILED: "Telegram rejected the test notification for an unrecognized reason.",
    };
    const status = result.code === "TEST_RATE_LIMITED" || result.code === "TEST_TELEGRAM_RATE_LIMITED" ? 429
      : result.code === "TEST_UNAVAILABLE" ? 409
      : result.code === "TEST_CHAT_NOT_FOUND" || result.code === "TEST_CHAT_MIGRATED" || result.code === "TEST_NO_SEND_PERMISSION" ? 422
      : 502;
    return res.status(status).json({
      ok: false,
      code: result.code,
      error: errors[result.code] ?? errors.TEST_DELIVERY_FAILED,
    });
  });

  router.post("/preflight", async (_req, res) => {
    try {
      const result = await preflightConfiguredCryptoPayments();
      return res.json(result);
    } catch (error: any) {
      // Configuration errors may embed user-supplied endpoints or token values.
      // Do not forward exception text to the browser.
      return res.status(503).json({
        code: "CRYPTO_PAYMENT_PREFLIGHT_FAILED",
        error: "Crypto payment preflight failed. Check staging network configuration.",
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
    const requestKey = cleanNonEmptyString(
      req.get("Idempotency-Key")
    );

    if (!isPaymentNetwork(network) || !baseAmount || !expiresAt || !requestKey) {
      return res.status(400).json({
        code: "CRYPTO_PAYMENT_INVOICE_INPUT_INVALID",
        error:
          "network, baseAmount, expiresAt, and an Idempotency-Key header are required for a payment invoice.",
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
        requestKey,
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
