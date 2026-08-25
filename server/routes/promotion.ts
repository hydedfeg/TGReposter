import { Router, type RequestHandler } from "express";
import { PromotionAdminError, PromotionAdminService } from "../services/promotionAdminService";
import type { LegacySettingsReader } from "../services/telegramCredentialService";

interface PromotionRouterDependencies {
  authMiddleware: RequestHandler;
  requireSuperAdmin: RequestHandler;
  readLegacySettings: LegacySettingsReader;
}

function sendError(res: any, error: any) {
  if (error instanceof PromotionAdminError) {
    return res.status(error.status).json({
      error: error.message,
      code: error.code,
      ...(error.details ? { details: error.details } : {}),
    });
  }

  console.error("Promotion administration error:", error);
  return res.status(500).json({ error: "Promotion administration failed." });
}

export function createPromotionRouter({
  authMiddleware,
  requireSuperAdmin,
  readLegacySettings,
}: PromotionRouterDependencies) {
  const router = Router();
  const service = new PromotionAdminService(readLegacySettings);

  router.use(authMiddleware);

  // Bot credentials/configuration are super-admin only.
  router.get("/bot-accounts", requireSuperAdmin, async (_req, res) => {
    try {
      res.json({ botAccounts: await service.listBotAccounts() });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/bot-accounts", requireSuperAdmin, async (req, res) => {
    try {
      const account = await service.createBotAccount(req.body);
      res.status(201).json({ botAccount: account });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch("/bot-accounts/:id", requireSuperAdmin, async (req, res) => {
    try {
      res.json({ botAccount: await service.updateBotAccount(req.params.id, req.body) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete("/bot-accounts/:id", requireSuperAdmin, async (req, res) => {
    try {
      res.json(await service.deleteBotAccount(req.params.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/bot-accounts/:id/verify", requireSuperAdmin, async (req, res) => {
    try {
      res.json(await service.verifyBotAccount(req.params.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  // Authenticated admins may list approved target metadata for the future campaign
  // composer, but only super-admins may modify or connection-test infrastructure.
  router.get("/targets", async (_req, res) => {
    try {
      res.json({ targets: await service.listTargets() });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/targets", requireSuperAdmin, async (req, res) => {
    try {
      res.status(201).json({ target: await service.createTarget(req.body) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch("/targets/:id", requireSuperAdmin, async (req, res) => {
    try {
      res.json({ target: await service.updateTarget(req.params.id, req.body) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete("/targets/:id", requireSuperAdmin, async (req, res) => {
    try {
      res.json(await service.deleteTarget(req.params.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/targets/:id/test", requireSuperAdmin, async (req, res) => {
    try {
      res.json(await service.testTarget(req.params.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
