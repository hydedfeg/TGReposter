import { Router, type RequestHandler } from "express";
import { PromotionAdminError, PromotionAdminService } from "../services/promotionAdminService";
import { PromotionAIError, PromotionAIService } from "../services/promotionAIService";
import { PromotionCampaignError, PromotionCampaignService } from "../services/promotionCampaignService";
import type { LegacySettingsReader } from "../services/telegramCredentialService";

interface PromotionRouterDependencies {
  authMiddleware: RequestHandler;
  requireSuperAdmin: RequestHandler;
  readLegacySettings: LegacySettingsReader;
}

function sendError(res: any, error: any) {
  if (
    error instanceof PromotionAdminError ||
    error instanceof PromotionCampaignError ||
    error instanceof PromotionAIError
  ) {
    return res.status(error.status).json({
      error: error.message,
      code: error.code,
      ...(error.details ? { details: error.details } : {}),
    });
  }

  console.error("Promotion API error:", error);
  return res.status(500).json({ error: "Promotion operation failed." });
}

export function createPromotionRouter({
  authMiddleware,
  requireSuperAdmin,
  readLegacySettings,
}: PromotionRouterDependencies) {
  const router = Router();
  const adminService = new PromotionAdminService(readLegacySettings);
  const campaignService = new PromotionCampaignService(readLegacySettings);
  const aiService = new PromotionAIService(readLegacySettings);

  router.use(authMiddleware);
  router.use((req: any, res, next) => {
    // The legacy auth middleware allows bootstrap traffic when no users exist.
    // Promotion infrastructure and campaign data stay closed until a real session exists.
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized. Please log in." });
    }
    return next();
  });

  // Bot credentials/configuration are super-admin only.
  router.get("/bot-accounts", requireSuperAdmin, async (_req, res) => {
    try {
      res.json({ botAccounts: await adminService.listBotAccounts() });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/bot-accounts", requireSuperAdmin, async (req, res) => {
    try {
      const account = await adminService.createBotAccount(req.body);
      res.status(201).json({ botAccount: account });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch("/bot-accounts/:id", requireSuperAdmin, async (req, res) => {
    try {
      res.json({ botAccount: await adminService.updateBotAccount(req.params.id, req.body) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete("/bot-accounts/:id", requireSuperAdmin, async (req, res) => {
    try {
      res.json(await adminService.deleteBotAccount(req.params.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/bot-accounts/:id/verify", requireSuperAdmin, async (req, res) => {
    try {
      res.json(await adminService.verifyBotAccount(req.params.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  // Authenticated admins may list approved target metadata for campaign composition,
  // while only super-admins can mutate or connection-test Telegram infrastructure.
  router.get("/targets", async (_req, res) => {
    try {
      res.json({ targets: await adminService.listTargets() });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/targets", requireSuperAdmin, async (req, res) => {
    try {
      res.status(201).json({ target: await adminService.createTarget(req.body) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch("/targets/:id", requireSuperAdmin, async (req, res) => {
    try {
      res.json({ target: await adminService.updateTarget(req.params.id, req.body) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete("/targets/:id", requireSuperAdmin, async (req, res) => {
    try {
      res.json(await adminService.deleteTarget(req.params.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/targets/:id/test", requireSuperAdmin, async (req, res) => {
    try {
      res.json(await adminService.testTarget(req.params.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  // Campaign workflow is available to both admins and super-admins. Infrastructure
  // credentials remain invisible; campaign execution resolves them server-side.
  router.get("/campaigns", async (_req, res) => {
    try {
      res.json({ campaigns: await campaignService.listCampaigns() });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/campaigns", async (req: any, res) => {
    try {
      const campaign = await campaignService.createCampaign(req.body, req.user?.username);
      res.status(201).json({ campaign });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/campaigns/:id", async (req, res) => {
    try {
      res.json(await campaignService.getCampaignDetail(req.params.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch("/campaigns/:id", async (req, res) => {
    try {
      res.json({ campaign: await campaignService.updateCampaign(req.params.id, req.body) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete("/campaigns/:id", async (req, res) => {
    try {
      res.json(await campaignService.deleteCampaign(req.params.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/campaigns/:id/posts", async (req, res) => {
    try {
      const campaignPost = await campaignService.addCampaignPost(req.params.id, req.body);
      res.status(201).json({ campaignPost });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch("/campaigns/:id/posts/:campaignPostId", async (req, res) => {
    try {
      res.json({
        campaignPost: await campaignService.updateCampaignPost(
          req.params.id,
          req.params.campaignPostId,
          req.body
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete("/campaigns/:id/posts/:campaignPostId", async (req, res) => {
    try {
      res.json(await campaignService.deleteCampaignPost(req.params.id, req.params.campaignPostId));
    } catch (error) {
      sendError(res, error);
    }
  });

  // AI generation is scoped to an existing mutable campaign post. The server resolves
  // the configured provider/model and API credentials; the frontend receives only copy.
  router.post("/campaigns/:id/posts/:campaignPostId/ai", async (req, res) => {
    try {
      res.json(await aiService.generate(req.params.id, req.params.campaignPostId, req.body));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/campaigns/:id/launch", async (req, res) => {
    try {
      res.json(await campaignService.launchCampaign(req.params.id, req.body));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/campaigns/:id/retry", async (req, res) => {
    try {
      res.json(await campaignService.retryFailedDeliveries(req.params.id, req.body));
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
