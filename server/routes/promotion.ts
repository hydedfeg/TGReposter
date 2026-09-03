import { Router, type RequestHandler } from "express";
import { OwnedPromotionCampaignRepository } from "../repositories/ownedPromotionCampaignRepository";
import { PromotionRepository } from "../repositories/promotionRepository";
import { PromotionAdminError, PromotionAdminService } from "../services/promotionAdminService";
import { PromotionAIError, PromotionAIService } from "../services/promotionAIService";
import { PromotionCampaignError, PromotionCampaignService } from "../services/promotionCampaignService";
import { ownerPrincipalForUser } from "../services/userPrincipalService";
import { userWorkspaceRepository } from "../services/userWorkspaceService";
import {
  getUserTelegramBotToken,
  type LegacySettingsReader,
} from "../services/telegramCredentialService";
import { PostgresConnectionConfigError } from "../utils/postgresConnection";

interface PromotionRouterDependencies {
  authMiddleware: RequestHandler;
  // Kept in the dependency shape for backwards-compatible server wiring.
  // Promotion configuration itself is personal and no longer super-admin-only.
  requireSuperAdmin: RequestHandler;
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

function servicesFor(req: any) {
  const ownerPrincipal = ownerPrincipalForUser(req.user);
  const adminRepository = new PromotionRepository(ownerPrincipal);
  const campaignRepository = new OwnedPromotionCampaignRepository(ownerPrincipal);

  const readUserSettings = async () => {
    const [workspace, botToken] = await Promise.all([
      userWorkspaceRepository.getConfig(ownerPrincipal),
      getUserTelegramBotToken(ownerPrincipal),
    ]);

    return {
      aiConfig: workspace.aiConfig,
      destination: {
        botToken,
      },
    };
  };

  return {
    adminService: new PromotionAdminService(readUserSettings, adminRepository),
    campaignService: new PromotionCampaignService(
      readUserSettings,
      campaignRepository,
      adminRepository
    ),
    aiService: new PromotionAIService(readUserSettings, campaignRepository),
  };
}

export function createPromotionRouter({
  authMiddleware,
}: PromotionRouterDependencies) {
  const router = Router();

  router.use(authMiddleware);
  router.use((req: any, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized. Please log in." });
    }
    return next();
  });

  // Every promotion bot account and target belongs to the signed-in user.
  router.get("/bot-accounts", async (req: any, res) => {
    try {
      res.json({ botAccounts: await servicesFor(req).adminService.listBotAccounts() });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/bot-accounts", async (req: any, res) => {
    try {
      const account = await servicesFor(req).adminService.createBotAccount(req.body);
      res.status(201).json({ botAccount: account });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch("/bot-accounts/:id", async (req: any, res) => {
    try {
      res.json({
        botAccount: await servicesFor(req).adminService.updateBotAccount(
          req.params.id,
          req.body
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete("/bot-accounts/:id", async (req: any, res) => {
    try {
      res.json(await servicesFor(req).adminService.deleteBotAccount(req.params.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/bot-accounts/:id/verify", async (req: any, res) => {
    try {
      res.json(await servicesFor(req).adminService.verifyBotAccount(req.params.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/targets", async (req: any, res) => {
    try {
      res.json({ targets: await servicesFor(req).adminService.listTargets() });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/targets", async (req: any, res) => {
    try {
      res.status(201).json({
        target: await servicesFor(req).adminService.createTarget(req.body),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch("/targets/:id", async (req: any, res) => {
    try {
      res.json({
        target: await servicesFor(req).adminService.updateTarget(
          req.params.id,
          req.body
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete("/targets/:id", async (req: any, res) => {
    try {
      res.json(await servicesFor(req).adminService.deleteTarget(req.params.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/targets/:id/test", async (req: any, res) => {
    try {
      res.json(await servicesFor(req).adminService.testTarget(req.params.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  // Campaigns, their selected posts, delivery history, and AI copy are also
  // isolated by the authenticated user's owner principal.
  router.get("/campaigns", async (req: any, res) => {
    try {
      res.json({ campaigns: await servicesFor(req).campaignService.listCampaigns() });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/campaigns", async (req: any, res) => {
    try {
      const campaign = await servicesFor(req).campaignService.createCampaign(
        req.body,
        req.user?.username
      );
      res.status(201).json({ campaign });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/campaigns/:id", async (req: any, res) => {
    try {
      res.json(await servicesFor(req).campaignService.getCampaignDetail(req.params.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch("/campaigns/:id", async (req: any, res) => {
    try {
      res.json({
        campaign: await servicesFor(req).campaignService.updateCampaign(
          req.params.id,
          req.body
        ),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete("/campaigns/:id", async (req: any, res) => {
    try {
      res.json(await servicesFor(req).campaignService.deleteCampaign(req.params.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/campaigns/:id/posts", async (req: any, res) => {
    try {
      const campaignPost = await servicesFor(req).campaignService.addCampaignPost(
        req.params.id,
        req.body
      );
      res.status(201).json({ campaignPost });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch("/campaigns/:id/posts/:campaignPostId", async (req: any, res) => {
    try {
      res.json({
        campaignPost: await servicesFor(req).campaignService.updateCampaignPost(
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
      res.json(
        await servicesFor(req).campaignService.deleteCampaignPost(
          req.params.id,
          req.params.campaignPostId
        )
      );
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/campaigns/:id/posts/:campaignPostId/ai", async (req: any, res) => {
    try {
      res.json(
        await servicesFor(req).aiService.generate(
          req.params.id,
          req.params.campaignPostId,
          req.body
        )
      );
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/campaigns/:id/launch", async (req: any, res) => {
    try {
      res.json(
        await servicesFor(req).campaignService.launchCampaign(
          req.params.id,
          req.body
        )
      );
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/campaigns/:id/retry", async (req: any, res) => {
    try {
      res.json(
        await servicesFor(req).campaignService.retryFailedDeliveries(
          req.params.id,
          req.body
        )
      );
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
