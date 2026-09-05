import { Router, type RequestHandler } from "express";
import { PromotionAdminError, PromotionAdminService } from "../services/promotionAdminService";
import { PromotionAIError, PromotionAIService } from "../services/promotionAIService";
import { PromotionCampaignError, PromotionCampaignService } from "../services/promotionCampaignService";
import type { LegacySettingsReader } from "../services/telegramCredentialService";
import { ownerPrincipalForUser } from "../services/userPrincipalService";
import { PostgresConnectionConfigError } from "../utils/postgresConnection";

interface PromotionRouterDependencies {
  authMiddleware: RequestHandler;
  readLegacySettings: LegacySettingsReader;
}

function sendError(res: any, error: any) {
  if (error instanceof PostgresConnectionConfigError) {
    return res.status(503).json({
      error: "Promotion database connection is not configured correctly. Check DATABASE_URL.",
      code: "PROMOTION_DATABASE_CONFIG_ERROR",
    });
  }

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

  router.get("/bot-accounts", async (req: any, res) => {
    try {
      const ownerPrincipal = ownerPrincipalForUser(req.user);
      res.json({ botAccounts: await adminService.listBotAccounts(ownerPrincipal) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/bot-accounts", async (req: any, res) => {
    try {
      const ownerPrincipal = ownerPrincipalForUser(req.user);
      const account = await adminService.createBotAccount(ownerPrincipal, req.body);
      res.status(201).json({ botAccount: account });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/bot-accounts/personal", async (req: any, res) => {
    try {
      const ownerPrincipal = ownerPrincipalForUser(req.user);
      const account = await adminService.createPersonalDestinationBot(ownerPrincipal);
      res.status(201).json({ botAccount: account });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch("/bot-accounts/:id", async (req: any, res) => {
    try {
      const ownerPrincipal = ownerPrincipalForUser(req.user);
      res.json({ botAccount: await adminService.updateBotAccount(ownerPrincipal, req.params.id, req.body) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete("/bot-accounts/:id", async (req: any, res) => {
    try {
      const ownerPrincipal = ownerPrincipalForUser(req.user);
      res.json(await adminService.deleteBotAccount(ownerPrincipal, req.params.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/bot-accounts/:id/verify", async (req: any, res) => {
    try {
      const ownerPrincipal = ownerPrincipalForUser(req.user);
      res.json(await adminService.verifyBotAccount(ownerPrincipal, req.params.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/targets", async (req: any, res) => {
    try {
      const ownerPrincipal = ownerPrincipalForUser(req.user);
      res.json({ targets: await adminService.listTargets(ownerPrincipal) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/targets", async (req: any, res) => {
    try {
      const ownerPrincipal = ownerPrincipalForUser(req.user);
      res.status(201).json({ target: await adminService.createTarget(ownerPrincipal, req.body) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch("/targets/:id", async (req: any, res) => {
    try {
      const ownerPrincipal = ownerPrincipalForUser(req.user);
      res.json({ target: await adminService.updateTarget(ownerPrincipal, req.params.id, req.body) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete("/targets/:id", async (req: any, res) => {
    try {
      const ownerPrincipal = ownerPrincipalForUser(req.user);
      res.json(await adminService.deleteTarget(ownerPrincipal, req.params.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/targets/:id/test", async (req: any, res) => {
    try {
      const ownerPrincipal = ownerPrincipalForUser(req.user);
      res.json(await adminService.testTarget(ownerPrincipal, req.params.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  // Every authenticated account receives an isolated campaign workspace. Bot
  // credentials stay server-side and are resolved only for that account owner.
  router.get("/campaigns", async (req: any, res) => {
    try {
      const ownerPrincipal = ownerPrincipalForUser(req.user);
      res.json({ campaigns: await campaignService.listCampaigns(ownerPrincipal) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/campaigns", async (req: any, res) => {
    try {
      const ownerPrincipal = ownerPrincipalForUser(req.user);
      const campaign = await campaignService.createCampaign(ownerPrincipal, req.body, req.user?.username);
      res.status(201).json({ campaign });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/campaigns/:id", async (req: any, res) => {
    try {
      const ownerPrincipal = ownerPrincipalForUser(req.user);
      res.json(await campaignService.getCampaignDetail(ownerPrincipal, req.params.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch("/campaigns/:id", async (req: any, res) => {
    try {
      const ownerPrincipal = ownerPrincipalForUser(req.user);
      res.json({ campaign: await campaignService.updateCampaign(ownerPrincipal, req.params.id, req.body) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete("/campaigns/:id", async (req: any, res) => {
    try {
      const ownerPrincipal = ownerPrincipalForUser(req.user);
      res.json(await campaignService.deleteCampaign(ownerPrincipal, req.params.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/campaigns/:id/posts", async (req: any, res) => {
    try {
      const ownerPrincipal = ownerPrincipalForUser(req.user);
      const campaignPost = await campaignService.addCampaignPost(ownerPrincipal, req.params.id, req.body);
      res.status(201).json({ campaignPost });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch("/campaigns/:id/posts/:campaignPostId", async (req: any, res) => {
    try {
      const ownerPrincipal = ownerPrincipalForUser(req.user);
      res.json({
        campaignPost: await campaignService.updateCampaignPost(
          ownerPrincipal,
          req.params.id,
          req.params.campaignPostId,
          req.body
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete("/campaigns/:id/posts/:campaignPostId", async (req: any, res) => {
    try {
      const ownerPrincipal = ownerPrincipalForUser(req.user);
      res.json(await campaignService.deleteCampaignPost(ownerPrincipal, req.params.id, req.params.campaignPostId));
    } catch (error) {
      sendError(res, error);
    }
  });

  // AI generation is scoped to an existing mutable campaign post. The server resolves
  // the configured provider/model and API credentials; the frontend receives only copy.
  router.post("/campaigns/:id/posts/:campaignPostId/ai", async (req: any, res) => {
    try {
      const ownerPrincipal = ownerPrincipalForUser(req.user);
      res.json(await aiService.generate(ownerPrincipal, req.params.id, req.params.campaignPostId, req.body));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/campaigns/:id/launch", async (req: any, res) => {
    try {
      const ownerPrincipal = ownerPrincipalForUser(req.user);
      res.json(await campaignService.launchCampaign(ownerPrincipal, req.params.id, req.body));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/campaigns/:id/retry", async (req: any, res) => {
    try {
      const ownerPrincipal = ownerPrincipalForUser(req.user);
      res.json(await campaignService.retryFailedDeliveries(ownerPrincipal, req.params.id, req.body));
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
