import promotionRepository, {
  type PromotionTargetRecord,
  type TelegramBotAccountRecord,
} from "../repositories/promotionRepository";
import promotionCampaignRepository, {
  type PromotionCampaignPostRecord,
  type PromotionCampaignRepository,
  type PromotionCampaignStatus,
  type PromotionContentMode,
  type PromotionDeliveryWorkItem,
  type PromotionSourcePostRecord,
} from "../repositories/promotionCampaignRepository";
import telegramPublisherService from "./telegramPublisherService";
import {
  resolveTelegramBotToken,
  type LegacySettingsReader,
} from "./telegramCredentialService";

export class PromotionCampaignError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "PromotionCampaignError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const contentModes = new Set<PromotionContentMode>(["original", "teaser", "ai", "custom"]);
const mutableCampaignStatuses = new Set<PromotionCampaignStatus>(["draft", "ready"]);
const editableStatuses = new Set<PromotionCampaignStatus>(["draft", "ready", "cancelled"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new PromotionCampaignError(400, "VALIDATION_ERROR", `${field} is required.`);
  }
  return value.trim();
}

function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new PromotionCampaignError(400, "VALIDATION_ERROR", `${field} must be a string.`);
  }
  return value.trim() || undefined;
}

function optionalPosition(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 0) {
    throw new PromotionCampaignError(400, "VALIDATION_ERROR", "position must be a non-negative integer.");
  }
  return value;
}

function validateUuid(value: unknown, field: string): string {
  const id = requiredText(value, field);
  if (!uuidPattern.test(id)) {
    throw new PromotionCampaignError(400, "VALIDATION_ERROR", `${field} must be a valid UUID.`);
  }
  return id;
}

function uniqueUuidArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new PromotionCampaignError(400, "VALIDATION_ERROR", `${field} must be a non-empty array.`);
  }
  return Array.from(new Set(value.map((item, index) => validateUuid(item, `${field}[${index}]`))));
}

function optionalLink(value: unknown): string | undefined {
  const link = optionalText(value, "sourceLinkOverride");
  if (!link) return undefined;
  try {
    const url = new URL(link);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("unsupported protocol");
  } catch {
    throw new PromotionCampaignError(400, "VALIDATION_ERROR", "sourceLinkOverride must be a valid HTTP(S) URL.");
  }
  return link;
}

function mapDatabaseError(error: any): never {
  if (error instanceof PromotionCampaignError) throw error;
  if (error?.code === "23505") {
    throw new PromotionCampaignError(409, "DUPLICATE", "This post is already attached to the campaign.");
  }
  if (error?.code === "23503") {
    throw new PromotionCampaignError(409, "REFERENCE_CONFLICT", "A referenced promotion record no longer exists.");
  }
  if (error?.message === "CAMPAIGN_NOT_FOUND") {
    throw new PromotionCampaignError(404, "NOT_FOUND", "Promotion campaign not found.");
  }
  if (typeof error?.message === "string" && error.message.startsWith("CAMPAIGN_STATUS:")) {
    const status = error.message.split(":")[1];
    throw new PromotionCampaignError(409, "CAMPAIGN_STATE_CONFLICT", `Campaign cannot be launched from status '${status}'.`);
  }
  throw error;
}

export function renderPromotionText(
  campaignPost: PromotionCampaignPostRecord,
  sourcePost: PromotionSourcePostRecord
): string {
  const baseText = campaignPost.contentMode === "original"
    ? sourcePost.originalText.trim()
    : (campaignPost.promotionText || "").trim();

  const sourceLink = (campaignPost.sourceLinkOverride || sourcePost.telegramUrl || "").trim();
  const cta = (campaignPost.ctaText || "").trim();
  const parts: string[] = [];

  if (baseText) parts.push(baseText);
  if (cta) parts.push(cta);
  if (sourceLink && !parts.some(part => part.includes(sourceLink))) parts.push(sourceLink);

  const rendered = parts.join("\n\n").trim();
  if (!rendered) {
    throw new PromotionCampaignError(
      400,
      "CONTENT_NOT_READY",
      `Campaign post '${campaignPost.id}' has no publishable promotion text or source link.`
    );
  }
  return rendered;
}

function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const bSet = new Set(b);
  return a.every(id => bSet.has(id));
}

export class PromotionCampaignService {
  constructor(
    private readonly readLegacySettings: LegacySettingsReader,
    private readonly repository: PromotionCampaignRepository = promotionCampaignRepository
  ) {}

  async listCampaigns() {
    return this.repository.listCampaigns();
  }

  async getCampaignDetail(id: string) {
    const campaign = await this.repository.getCampaign(id);
    if (!campaign) throw new PromotionCampaignError(404, "NOT_FOUND", "Promotion campaign not found.");

    const [campaignPosts, deliveries, attempts, summary] = await Promise.all([
      this.repository.listCampaignPosts(id),
      this.repository.listDeliveries(id),
      this.repository.listDeliveryAttempts(id),
      this.repository.getDeliverySummary(id),
    ]);
    const posts = await Promise.all(campaignPosts.map(async campaignPost => ({
      ...campaignPost,
      sourcePost: await this.repository.getSourcePost(campaignPost.postId),
    })));

    return { campaign, posts, deliveries, attempts, summary };
  }

  async createCampaign(body: any, username?: string) {
    try {
      return await this.repository.createCampaign({
        name: requiredText(body?.name, "name"),
        description: optionalText(body?.description, "description"),
        createdByUsername: username,
      });
    } catch (error) {
      return mapDatabaseError(error);
    }
  }

  async updateCampaign(id: string, body: any) {
    const campaign = await this.repository.getCampaign(id);
    if (!campaign) throw new PromotionCampaignError(404, "NOT_FOUND", "Promotion campaign not found.");
    if (!editableStatuses.has(campaign.status)) {
      throw new PromotionCampaignError(409, "CAMPAIGN_STATE_CONFLICT", "A campaign with delivery history cannot be edited manually.");
    }

    let nextStatus: PromotionCampaignStatus | undefined;
    if (body?.status !== undefined) {
      if (body.status !== "draft" && body.status !== "ready" && body.status !== "cancelled") {
        throw new PromotionCampaignError(400, "VALIDATION_ERROR", "status may only be draft, ready, or cancelled before publishing.");
      }
      if (campaign.status === "cancelled" && body.status !== "cancelled") {
        throw new PromotionCampaignError(409, "CAMPAIGN_STATE_CONFLICT", "A cancelled campaign cannot be reopened.");
      }
      nextStatus = body.status;
    }

    const name = body?.name === undefined ? undefined : requiredText(body.name, "name");
    const description = body?.description === undefined
      ? undefined
      : optionalText(body.description, "description") ?? null;

    const updated = await this.repository.updateCampaign(id, { name, description, status: nextStatus });
    return updated!;
  }

  async deleteCampaign(id: string) {
    const campaign = await this.repository.getCampaign(id);
    if (!campaign) throw new PromotionCampaignError(404, "NOT_FOUND", "Promotion campaign not found.");
    if (!editableStatuses.has(campaign.status)) {
      throw new PromotionCampaignError(409, "CAMPAIGN_STATE_CONFLICT", "Campaigns with delivery history are retained for audit and cannot be deleted.");
    }
    const summary = await this.repository.getDeliverySummary(id);
    if (summary.total > 0) {
      throw new PromotionCampaignError(409, "CAMPAIGN_STATE_CONFLICT", "Campaign delivery history must be retained for audit.");
    }
    await this.repository.deleteCampaign(id);
    return { success: true };
  }

  private async requireMutableCampaign(campaignId: string) {
    const campaign = await this.repository.getCampaign(campaignId);
    if (!campaign) throw new PromotionCampaignError(404, "NOT_FOUND", "Promotion campaign not found.");
    if (!mutableCampaignStatuses.has(campaign.status)) {
      throw new PromotionCampaignError(409, "CAMPAIGN_STATE_CONFLICT", "Campaign posts can only be edited while the campaign is draft or ready.");
    }
    return campaign;
  }

  private validateContentMode(value: unknown): PromotionContentMode {
    if (!contentModes.has(value as PromotionContentMode)) {
      throw new PromotionCampaignError(400, "VALIDATION_ERROR", "contentMode must be original, teaser, ai, or custom.");
    }
    return value as PromotionContentMode;
  }

  async addCampaignPost(campaignId: string, body: any) {
    await this.requireMutableCampaign(campaignId);
    const postId = requiredText(body?.postId, "postId");
    if (!(await this.repository.getSourcePost(postId))) {
      throw new PromotionCampaignError(404, "POST_NOT_FOUND", "Selected collected post does not exist.");
    }

    try {
      return await this.repository.createCampaignPost({
        campaignId,
        postId,
        contentMode: this.validateContentMode(body?.contentMode ?? "original"),
        promotionText: optionalText(body?.promotionText, "promotionText"),
        ctaText: optionalText(body?.ctaText, "ctaText"),
        sourceLinkOverride: optionalLink(body?.sourceLinkOverride),
        position: optionalPosition(body?.position),
      });
    } catch (error) {
      return mapDatabaseError(error);
    }
  }

  async updateCampaignPost(campaignId: string, campaignPostId: string, body: any) {
    await this.requireMutableCampaign(campaignId);
    const existing = await this.repository.getCampaignPost(campaignPostId);
    if (!existing || existing.campaignId !== campaignId) {
      throw new PromotionCampaignError(404, "NOT_FOUND", "Promotion campaign post not found.");
    }

    const updated = await this.repository.updateCampaignPost(campaignPostId, {
      contentMode: body?.contentMode === undefined ? undefined : this.validateContentMode(body.contentMode),
      promotionText: body?.promotionText === undefined ? undefined : optionalText(body.promotionText, "promotionText") ?? null,
      ctaText: body?.ctaText === undefined ? undefined : optionalText(body.ctaText, "ctaText") ?? null,
      sourceLinkOverride: body?.sourceLinkOverride === undefined ? undefined : optionalLink(body.sourceLinkOverride) ?? null,
      position: optionalPosition(body?.position),
    });
    return updated!;
  }

  async deleteCampaignPost(campaignId: string, campaignPostId: string) {
    await this.requireMutableCampaign(campaignId);
    const existing = await this.repository.getCampaignPost(campaignPostId);
    if (!existing || existing.campaignId !== campaignId) {
      throw new PromotionCampaignError(404, "NOT_FOUND", "Promotion campaign post not found.");
    }
    await this.repository.deleteCampaignPost(campaignPostId);
    return { success: true };
  }

  private async validateTargets(targetIds: string[]) {
    const [targets, accounts] = await Promise.all([
      promotionRepository.listTargets(),
      promotionRepository.listBotAccounts(),
    ]);
    const targetById = new Map(targets.map(target => [target.id, target]));
    const accountById = new Map(accounts.map(account => [account.id, account]));
    const problems: Array<{ targetId: string; reason: string }> = [];

    for (const id of targetIds) {
      const target = targetById.get(id);
      if (!target) {
        problems.push({ targetId: id, reason: "Target does not exist." });
        continue;
      }
      const account = accountById.get(target.botAccountId);
      if (!target.enabled) problems.push({ targetId: id, reason: "Target is disabled." });
      else if (target.connectionStatus !== "ok") problems.push({ targetId: id, reason: "Target has not passed its Telegram connection test." });
      else if (!account) problems.push({ targetId: id, reason: "Target bot account does not exist." });
      else if (!account.enabled) problems.push({ targetId: id, reason: "Target bot account is disabled." });
    }

    if (problems.length) {
      throw new PromotionCampaignError(400, "INVALID_TARGETS", "One or more promotion targets are not ready for publishing.", { targets: problems });
    }

    return {
      targets: targetIds.map(id => targetById.get(id)!),
      accountsById: accountById,
    };
  }

  private async validateCampaignContent(campaignId: string) {
    const campaignPosts = await this.repository.listCampaignPosts(campaignId);
    if (campaignPosts.length === 0) {
      throw new PromotionCampaignError(400, "EMPTY_CAMPAIGN", "Add at least one post before launching the campaign.");
    }

    for (const campaignPost of campaignPosts) {
      const sourcePost = await this.repository.getSourcePost(campaignPost.postId);
      if (!sourcePost) {
        throw new PromotionCampaignError(409, "REFERENCE_CONFLICT", `Collected post '${campaignPost.postId}' no longer exists.`);
      }
      renderPromotionText(campaignPost, sourcePost);
    }
    return campaignPosts;
  }

  private async recordFailure(items: Array<{ item: PromotionDeliveryWorkItem; attemptNumber: number }>, message: string) {
    await Promise.all(items.map(({ item, attemptNumber }) => this.repository.completeDeliveryAttempt({
      deliveryId: item.delivery.id,
      attemptNumber,
      success: false,
      errorMessage: message,
    })));
  }

  private async executeDeliveries(
    campaignId: string,
    allowedStatus: "pending" | "failed",
    deliveryIds?: string[]
  ) {
    const workItems = await this.repository.listDeliveryWorkItems(campaignId, [allowedStatus], deliveryIds);
    if (deliveryIds?.length) {
      const found = new Set(workItems.map(item => item.delivery.id));
      const unavailable = deliveryIds.filter(id => !found.has(id));
      if (unavailable.length) {
        throw new PromotionCampaignError(
          400,
          "DELIVERIES_NOT_RETRYABLE",
          "Some selected deliveries do not belong to this campaign or are not failed.",
          { deliveryIds: unavailable }
        );
      }
    }

    const groups = new Map<string, PromotionDeliveryWorkItem[]>();
    for (const item of workItems) {
      const key = `${item.campaignPost.id}:${item.botAccount.id}`;
      const group = groups.get(key) || [];
      group.push(item);
      groups.set(key, group);
    }

    for (const group of groups.values()) {
      const claimed: Array<{ item: PromotionDeliveryWorkItem; attemptNumber: number }> = [];
      for (const item of group) {
        const delivery = await this.repository.claimDelivery(item.delivery.id, allowedStatus);
        if (delivery) claimed.push({ item, attemptNumber: delivery.attemptCount });
      }
      if (claimed.length === 0) continue;

      const publishable: typeof claimed = [];
      const configurationFailures: Array<{ claimed: (typeof claimed)[number]; message: string }> = [];
      for (const entry of claimed) {
        if (!entry.item.target.enabled) {
          configurationFailures.push({ claimed: entry, message: "Promotion target is disabled." });
        } else if (entry.item.target.connectionStatus !== "ok") {
          configurationFailures.push({ claimed: entry, message: "Promotion target is no longer verified for publishing." });
        } else if (!entry.item.botAccount.enabled) {
          configurationFailures.push({ claimed: entry, message: "Telegram bot account is disabled." });
        } else {
          publishable.push(entry);
        }
      }
      await Promise.all(configurationFailures.map(({ claimed: entry, message }) =>
        this.repository.completeDeliveryAttempt({
          deliveryId: entry.item.delivery.id,
          attemptNumber: entry.attemptNumber,
          success: false,
          errorMessage: message,
        })
      ));
      if (publishable.length === 0) continue;

      let botToken: string;
      let text: string;
      try {
        const representative = publishable[0].item;
        botToken = await resolveTelegramBotToken(
          representative.botAccount as TelegramBotAccountRecord,
          this.readLegacySettings
        );
        text = renderPromotionText(representative.campaignPost, representative.sourcePost);
      } catch (error: any) {
        await this.recordFailure(publishable, error?.message || "Promotion content or Telegram credential could not be resolved.");
        continue;
      }

      const representative = publishable[0].item;
      try {
        const publishResult = await telegramPublisherService.publish({
          botToken,
          targets: publishable.map(({ item }) => ({
            id: item.delivery.id,
            channelId: item.target.chatId,
            name: item.target.name,
          })),
          post: {
            url: representative.campaignPost.sourceLinkOverride || representative.sourcePost.telegramUrl || "",
            photoUrl: representative.sourcePost.photoUrl,
            videoUrl: representative.sourcePost.videoUrl,
          },
          text,
        });

        const resultsByDeliveryId = new Map(publishResult.results.map(result => [result.targetId, result]));
        await Promise.all(publishable.map(async ({ item, attemptNumber }) => {
          const result = resultsByDeliveryId.get(item.delivery.id);
          if (!result) {
            await this.repository.completeDeliveryAttempt({
              deliveryId: item.delivery.id,
              attemptNumber,
              success: false,
              errorMessage: "Telegram publisher returned no result for this delivery.",
            });
            return;
          }
          await this.repository.completeDeliveryAttempt({
            deliveryId: item.delivery.id,
            attemptNumber,
            success: result.success,
            warningMessage: result.warning,
            errorMessage: result.error,
          });
        }));
      } catch (error: any) {
        await this.recordFailure(publishable, error?.message || "Telegram publishing failed unexpectedly.");
      }
    }
  }

  async launchCampaign(campaignId: string, body: any) {
    const targetIds = uniqueUuidArray(body?.targetIds, "targetIds");
    const campaign = await this.repository.getCampaign(campaignId);
    if (!campaign) throw new PromotionCampaignError(404, "NOT_FOUND", "Promotion campaign not found.");
    if (!["draft", "ready", "running"].includes(campaign.status)) {
      throw new PromotionCampaignError(409, "CAMPAIGN_STATE_CONFLICT", `Campaign cannot be launched from status '${campaign.status}'. Use retry for failed deliveries.`);
    }

    await this.validateCampaignContent(campaignId);
    await this.validateTargets(targetIds);

    let prepared: { campaign: any; resumed: boolean };
    try {
      prepared = await this.repository.prepareLaunch(campaignId, targetIds);
    } catch (error) {
      return mapDatabaseError(error);
    }

    if (prepared.resumed) {
      const existingTargetIds = await this.repository.getDistinctDeliveryTargetIds(campaignId);
      if (!sameIdSet(existingTargetIds, targetIds)) {
        throw new PromotionCampaignError(
          409,
          "CAMPAIGN_ALREADY_RUNNING",
          "This campaign is already running with a different target set. Resume it with the original targets.",
          { targetIds: existingTargetIds }
        );
      }
    }

    await this.executeDeliveries(campaignId, "pending");
    const updatedCampaign = await this.repository.refreshCampaignOutcome(campaignId);
    return {
      ...(await this.getCampaignDetail(campaignId)),
      campaign: updatedCampaign,
      resumed: prepared.resumed,
    };
  }

  async retryFailedDeliveries(campaignId: string, body: any) {
    const campaign = await this.repository.getCampaign(campaignId);
    if (!campaign) throw new PromotionCampaignError(404, "NOT_FOUND", "Promotion campaign not found.");
    if (campaign.status !== "partial" && campaign.status !== "failed") {
      throw new PromotionCampaignError(409, "CAMPAIGN_STATE_CONFLICT", "Only partial or failed campaigns have retryable deliveries.");
    }

    const deliveryIds = body?.deliveryIds === undefined
      ? undefined
      : uniqueUuidArray(body.deliveryIds, "deliveryIds");
    const failedWork = await this.repository.listDeliveryWorkItems(campaignId, ["failed"], deliveryIds);
    if (failedWork.length === 0) {
      throw new PromotionCampaignError(400, "NO_FAILED_DELIVERIES", "No failed promotion deliveries are available to retry.");
    }

    const targetIds = Array.from(new Set(failedWork.map(item => item.target.id)));
    await this.validateTargets(targetIds);
    const running = await this.repository.markCampaignRunningForRetry(campaignId);
    if (!running) {
      throw new PromotionCampaignError(409, "CAMPAIGN_STATE_CONFLICT", "Campaign retry could not acquire the campaign state.");
    }

    await this.executeDeliveries(campaignId, "failed", deliveryIds);
    const updatedCampaign = await this.repository.refreshCampaignOutcome(campaignId);
    return {
      ...(await this.getCampaignDetail(campaignId)),
      campaign: updatedCampaign,
    };
  }
}
