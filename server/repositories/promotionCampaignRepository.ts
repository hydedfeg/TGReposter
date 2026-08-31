import { Pool } from "pg";
import { getPostgresConnectionString } from "../utils/postgresConnection";

export type PromotionCampaignStatus = "draft" | "ready" | "running" | "completed" | "partial" | "failed" | "cancelled";
export type PromotionContentMode = "original" | "teaser" | "ai" | "custom";
export type PromotionDeliveryStatus = "pending" | "in_progress" | "success" | "failed" | "skipped";
export type PromotionDeliveryOutcome = "success" | "failed" | "warning";

export interface PromotionCampaignRecord {
  id: string;
  name: string;
  description?: string;
  status: PromotionCampaignStatus;
  createdByUsername?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PromotionCampaignPostRecord {
  id: string;
  campaignId: string;
  postId: string;
  contentMode: PromotionContentMode;
  promotionText?: string;
  ctaText?: string;
  sourceLinkOverride?: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface PromotionSourcePostRecord {
  id: string;
  channelUsername: string;
  originalText: string;
  editedText?: string;
  photoUrl?: string;
  videoUrl?: string;
  telegramUrl?: string;
  status: string;
  publishedAt?: string;
}

export interface PromotionDeliveryRecord {
  id: string;
  campaignPostId: string;
  targetId: string;
  status: PromotionDeliveryStatus;
  attemptCount: number;
  telegramMessageId?: number;
  warningMessage?: string;
  errorMessage?: string;
  lastAttemptAt?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PromotionDeliveryAttemptRecord {
  id: string;
  deliveryId: string;
  attemptNumber: number;
  outcome: PromotionDeliveryOutcome;
  telegramMessageId?: number;
  telegramErrorCode?: number;
  warningMessage?: string;
  errorMessage?: string;
  attemptedAt: string;
}

export interface PromotionDeliverySummary {
  total: number;
  pending: number;
  inProgress: number;
  succeeded: number;
  failed: number;
  skipped: number;
  warnings: number;
}

export interface PromotionDeliveryWorkItem {
  delivery: PromotionDeliveryRecord;
  campaignPost: PromotionCampaignPostRecord;
  sourcePost: PromotionSourcePostRecord;
  target: {
    id: string;
    botAccountId: string;
    name: string;
    chatId: string;
    chatType?: "channel" | "group" | "supergroup";
    enabled: boolean;
    connectionStatus: "unknown" | "ok" | "error";
  };
  botAccount: {
    id: string;
    name: string;
    botUsername?: string;
    credentialSource: "legacy_settings" | "environment" | "vault";
    credentialRef: string;
    enabled: boolean;
  };
}

export interface CreateCampaignInput {
  name: string;
  description?: string;
  createdByUsername?: string;
}

export interface UpdateCampaignInput {
  name?: string;
  description?: string | null;
  status?: PromotionCampaignStatus;
}

export interface CreateCampaignPostInput {
  campaignId: string;
  postId: string;
  contentMode: PromotionContentMode;
  promotionText?: string;
  ctaText?: string;
  sourceLinkOverride?: string;
  position?: number;
}

export interface UpdateCampaignPostInput {
  contentMode?: PromotionContentMode;
  promotionText?: string | null;
  ctaText?: string | null;
  sourceLinkOverride?: string | null;
  position?: number;
}

let pool: Pool | null = null;

function getPool(): Pool {
  const connectionString = getPostgresConnectionString();
  if (!pool) pool = new Pool({ connectionString, max: 5 });
  return pool;
}

function iso(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function mapCampaign(row: any): PromotionCampaignRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    status: row.status,
    createdByUsername: row.created_by_username ?? undefined,
    startedAt: iso(row.started_at),
    completedAt: iso(row.completed_at),
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  };
}

function mapCampaignPost(row: any): PromotionCampaignPostRecord {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    postId: row.post_id,
    contentMode: row.content_mode,
    promotionText: row.promotion_text ?? undefined,
    ctaText: row.cta_text ?? undefined,
    sourceLinkOverride: row.source_link_override ?? undefined,
    position: row.position,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  };
}

function mapSourcePost(row: any): PromotionSourcePostRecord {
  return {
    id: row.id,
    channelUsername: row.channel_username,
    originalText: row.original_text,
    editedText: row.edited_text ?? undefined,
    photoUrl: row.photo_url ?? undefined,
    videoUrl: row.video_url ?? undefined,
    telegramUrl: row.telegram_url ?? undefined,
    status: row.status,
    publishedAt: iso(row.published_at),
  };
}

function mapDelivery(row: any): PromotionDeliveryRecord {
  return {
    id: row.id,
    campaignPostId: row.campaign_post_id,
    targetId: row.target_id,
    status: row.status,
    attemptCount: Number(row.attempt_count),
    telegramMessageId: row.telegram_message_id == null ? undefined : Number(row.telegram_message_id),
    warningMessage: row.warning_message ?? undefined,
    errorMessage: row.error_message ?? undefined,
    lastAttemptAt: iso(row.last_attempt_at),
    publishedAt: iso(row.published_at),
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  };
}

function mapAttempt(row: any): PromotionDeliveryAttemptRecord {
  return {
    id: row.id,
    deliveryId: row.delivery_id,
    attemptNumber: Number(row.attempt_number),
    outcome: row.outcome,
    telegramMessageId: row.telegram_message_id == null ? undefined : Number(row.telegram_message_id),
    telegramErrorCode: row.telegram_error_code ?? undefined,
    warningMessage: row.warning_message ?? undefined,
    errorMessage: row.error_message ?? undefined,
    attemptedAt: iso(row.attempted_at)!,
  };
}

const campaignSelect = "id, name, description, status, created_by_username, started_at, completed_at, created_at, updated_at";
const campaignPostSelect = "id, campaign_id, post_id, content_mode, promotion_text, cta_text, source_link_override, position, created_at, updated_at";
const deliverySelect = "id, campaign_post_id, target_id, status, attempt_count, telegram_message_id, warning_message, error_message, last_attempt_at, published_at, created_at, updated_at";

export class PromotionCampaignRepository {
  async listCampaigns(limit = 100): Promise<PromotionCampaignRecord[]> {
    const result = await getPool().query(
      `select ${campaignSelect} from public.promotion_campaigns order by created_at desc limit $1`,
      [limit]
    );
    return result.rows.map(mapCampaign);
  }

  async getCampaign(id: string): Promise<PromotionCampaignRecord | null> {
    const result = await getPool().query(
      `select ${campaignSelect} from public.promotion_campaigns where id = $1 limit 1`,
      [id]
    );
    return result.rows[0] ? mapCampaign(result.rows[0]) : null;
  }

  async createCampaign(input: CreateCampaignInput): Promise<PromotionCampaignRecord> {
    const result = await getPool().query(
      `insert into public.promotion_campaigns (name, description, created_by_username)
       values ($1, $2, $3) returning ${campaignSelect}`,
      [input.name, input.description ?? null, input.createdByUsername ?? null]
    );
    return mapCampaign(result.rows[0]);
  }

  async updateCampaign(id: string, input: UpdateCampaignInput): Promise<PromotionCampaignRecord | null> {
    const current = await this.getCampaign(id);
    if (!current) return null;
    const result = await getPool().query(
      `update public.promotion_campaigns
       set name = $2, description = $3, status = $4, updated_at = now()
       where id = $1 returning ${campaignSelect}`,
      [
        id,
        input.name ?? current.name,
        input.description === undefined ? current.description ?? null : input.description,
        input.status ?? current.status,
      ]
    );
    return result.rows[0] ? mapCampaign(result.rows[0]) : null;
  }

  async deleteCampaign(id: string): Promise<boolean> {
    const result = await getPool().query("delete from public.promotion_campaigns where id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async getSourcePost(postId: string): Promise<PromotionSourcePostRecord | null> {
    const result = await getPool().query(
      `select id, channel_username, original_text, edited_text, photo_url, video_url, telegram_url, status, published_at
       from public.posts where id = $1 limit 1`,
      [postId]
    );
    return result.rows[0] ? mapSourcePost(result.rows[0]) : null;
  }

  async listCampaignPosts(campaignId: string): Promise<PromotionCampaignPostRecord[]> {
    const result = await getPool().query(
      `select ${campaignPostSelect}
       from public.promotion_campaign_posts
       where campaign_id = $1
       order by position asc, created_at asc`,
      [campaignId]
    );
    return result.rows.map(mapCampaignPost);
  }

  async getCampaignPost(id: string): Promise<PromotionCampaignPostRecord | null> {
    const result = await getPool().query(
      `select ${campaignPostSelect} from public.promotion_campaign_posts where id = $1 limit 1`,
      [id]
    );
    return result.rows[0] ? mapCampaignPost(result.rows[0]) : null;
  }

  async createCampaignPost(input: CreateCampaignPostInput): Promise<PromotionCampaignPostRecord> {
    const result = await getPool().query(
      `insert into public.promotion_campaign_posts
        (campaign_id, post_id, content_mode, promotion_text, cta_text, source_link_override, position)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning ${campaignPostSelect}`,
      [input.campaignId, input.postId, input.contentMode, input.promotionText ?? null,
       input.ctaText ?? null, input.sourceLinkOverride ?? null, input.position ?? 0]
    );
    return mapCampaignPost(result.rows[0]);
  }

  async updateCampaignPost(id: string, input: UpdateCampaignPostInput): Promise<PromotionCampaignPostRecord | null> {
    const current = await this.getCampaignPost(id);
    if (!current) return null;
    const result = await getPool().query(
      `update public.promotion_campaign_posts
       set content_mode = $2, promotion_text = $3, cta_text = $4,
           source_link_override = $5, position = $6, updated_at = now()
       where id = $1 returning ${campaignPostSelect}`,
      [
        id,
        input.contentMode ?? current.contentMode,
        input.promotionText === undefined ? current.promotionText ?? null : input.promotionText,
        input.ctaText === undefined ? current.ctaText ?? null : input.ctaText,
        input.sourceLinkOverride === undefined ? current.sourceLinkOverride ?? null : input.sourceLinkOverride,
        input.position ?? current.position,
      ]
    );
    return result.rows[0] ? mapCampaignPost(result.rows[0]) : null;
  }

  async deleteCampaignPost(id: string): Promise<boolean> {
    const result = await getPool().query("delete from public.promotion_campaign_posts where id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async listDeliveries(campaignId: string): Promise<PromotionDeliveryRecord[]> {
    const result = await getPool().query(
      `select d.id, d.campaign_post_id, d.target_id, d.status, d.attempt_count,
              d.telegram_message_id, d.warning_message, d.error_message, d.last_attempt_at,
              d.published_at, d.created_at, d.updated_at
       from public.promotion_deliveries d
       join public.promotion_campaign_posts cp on cp.id = d.campaign_post_id
       where cp.campaign_id = $1
       order by d.created_at asc`,
      [campaignId]
    );
    return result.rows.map(mapDelivery);
  }

  async listDeliveryAttempts(campaignId: string): Promise<PromotionDeliveryAttemptRecord[]> {
    const result = await getPool().query(
      `select a.id, a.delivery_id, a.attempt_number, a.outcome, a.telegram_message_id,
              a.telegram_error_code, a.warning_message, a.error_message, a.attempted_at
       from public.promotion_delivery_attempts a
       join public.promotion_deliveries d on d.id = a.delivery_id
       join public.promotion_campaign_posts cp on cp.id = d.campaign_post_id
       where cp.campaign_id = $1
       order by a.attempted_at asc, a.attempt_number asc`,
      [campaignId]
    );
    return result.rows.map(mapAttempt);
  }

  async getDistinctDeliveryTargetIds(campaignId: string): Promise<string[]> {
    const result = await getPool().query(
      `select distinct d.target_id
       from public.promotion_deliveries d
       join public.promotion_campaign_posts cp on cp.id = d.campaign_post_id
       where cp.campaign_id = $1
       order by d.target_id`,
      [campaignId]
    );
    return result.rows.map(row => row.target_id);
  }

  async prepareLaunch(campaignId: string, targetIds: string[]): Promise<{ campaign: PromotionCampaignRecord; resumed: boolean }> {
    const client = await getPool().connect();
    try {
      await client.query("begin");
      const campaignResult = await client.query(
        `select ${campaignSelect} from public.promotion_campaigns where id = $1 for update`,
        [campaignId]
      );
      if (!campaignResult.rows[0]) throw new Error("CAMPAIGN_NOT_FOUND");

      const campaign = mapCampaign(campaignResult.rows[0]);
      const resumed = campaign.status === "running";
      if (!["draft", "ready", "running"].includes(campaign.status)) {
        throw new Error(`CAMPAIGN_STATUS:${campaign.status}`);
      }

      if (!resumed) {
        await client.query(
          `update public.promotion_campaigns
           set status = 'running', started_at = coalesce(started_at, now()),
               completed_at = null, updated_at = now()
           where id = $1`,
          [campaignId]
        );
        await client.query(
          `insert into public.promotion_deliveries (campaign_post_id, target_id, status)
           select cp.id, selected.target_id, 'pending'
           from public.promotion_campaign_posts cp
           cross join unnest($2::uuid[]) as selected(target_id)
           where cp.campaign_id = $1
           on conflict (campaign_post_id, target_id) do nothing`,
          [campaignId, targetIds]
        );
      }

      const updatedResult = await client.query(
        `select ${campaignSelect} from public.promotion_campaigns where id = $1`,
        [campaignId]
      );
      await client.query("commit");
      return { campaign: mapCampaign(updatedResult.rows[0]), resumed };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async markCampaignRunningForRetry(campaignId: string): Promise<PromotionCampaignRecord | null> {
    const result = await getPool().query(
      `update public.promotion_campaigns
       set status = 'running', completed_at = null, updated_at = now()
       where id = $1 and status in ('partial', 'failed')
       returning ${campaignSelect}`,
      [campaignId]
    );
    return result.rows[0] ? mapCampaign(result.rows[0]) : null;
  }

  async listDeliveryWorkItems(
    campaignId: string,
    statuses: PromotionDeliveryStatus[],
    deliveryIds?: string[]
  ): Promise<PromotionDeliveryWorkItem[]> {
    const values: unknown[] = [campaignId, statuses];
    let idFilter = "";
    if (deliveryIds?.length) {
      values.push(deliveryIds);
      idFilter = "and d.id = any($3::uuid[])";
    }

    const result = await getPool().query(
      `select
         d.id as delivery_id, d.campaign_post_id, d.target_id, d.status as delivery_status,
         d.attempt_count, d.telegram_message_id, d.warning_message, d.error_message,
         d.last_attempt_at, d.published_at as delivery_published_at,
         d.created_at as delivery_created_at, d.updated_at as delivery_updated_at,
         cp.id as cp_id, cp.campaign_id, cp.post_id, cp.content_mode, cp.promotion_text,
         cp.cta_text, cp.source_link_override, cp.position,
         cp.created_at as cp_created_at, cp.updated_at as cp_updated_at,
         p.channel_username, p.original_text, p.edited_text, p.photo_url, p.video_url,
         p.telegram_url, p.status as post_status, p.published_at as post_published_at,
         t.id as target_row_id, t.bot_account_id, t.name as target_name, t.chat_id,
         t.chat_type, t.enabled as target_enabled, t.connection_status,
         b.id as bot_id, b.name as bot_name, b.bot_username, b.credential_source,
         b.credential_ref, b.enabled as bot_enabled
       from public.promotion_deliveries d
       join public.promotion_campaign_posts cp on cp.id = d.campaign_post_id
       join public.posts p on p.id = cp.post_id
       join public.promotion_targets t on t.id = d.target_id
       join public.telegram_bot_accounts b on b.id = t.bot_account_id
       where cp.campaign_id = $1
         and d.status = any($2::text[])
         ${idFilter}
       order by cp.position asc, d.created_at asc`,
      values
    );

    return result.rows.map(row => ({
      delivery: mapDelivery({
        id: row.delivery_id,
        campaign_post_id: row.campaign_post_id,
        target_id: row.target_id,
        status: row.delivery_status,
        attempt_count: row.attempt_count,
        telegram_message_id: row.telegram_message_id,
        warning_message: row.warning_message,
        error_message: row.error_message,
        last_attempt_at: row.last_attempt_at,
        published_at: row.delivery_published_at,
        created_at: row.delivery_created_at,
        updated_at: row.delivery_updated_at,
      }),
      campaignPost: mapCampaignPost({
        id: row.cp_id,
        campaign_id: row.campaign_id,
        post_id: row.post_id,
        content_mode: row.content_mode,
        promotion_text: row.promotion_text,
        cta_text: row.cta_text,
        source_link_override: row.source_link_override,
        position: row.position,
        created_at: row.cp_created_at,
        updated_at: row.cp_updated_at,
      }),
      sourcePost: mapSourcePost({
        id: row.post_id,
        channel_username: row.channel_username,
        original_text: row.original_text,
        edited_text: row.edited_text,
        photo_url: row.photo_url,
        video_url: row.video_url,
        telegram_url: row.telegram_url,
        status: row.post_status,
        published_at: row.post_published_at,
      }),
      target: {
        id: row.target_row_id,
        botAccountId: row.bot_account_id,
        name: row.target_name,
        chatId: row.chat_id,
        chatType: row.chat_type ?? undefined,
        enabled: row.target_enabled,
        connectionStatus: row.connection_status,
      },
      botAccount: {
        id: row.bot_id,
        name: row.bot_name,
        botUsername: row.bot_username ?? undefined,
        credentialSource: row.credential_source,
        credentialRef: row.credential_ref,
        enabled: row.bot_enabled,
      },
    }));
  }

  async claimDelivery(id: string, allowedStatus: PromotionDeliveryStatus): Promise<PromotionDeliveryRecord | null> {
    const result = await getPool().query(
      `update public.promotion_deliveries
       set status = 'in_progress', attempt_count = attempt_count + 1,
           last_attempt_at = now(), warning_message = null, error_message = null,
           updated_at = now()
       where id = $1 and status = $2
       returning ${deliverySelect}`,
      [id, allowedStatus]
    );
    return result.rows[0] ? mapDelivery(result.rows[0]) : null;
  }

  async completeDeliveryAttempt(input: {
    deliveryId: string;
    attemptNumber: number;
    success: boolean;
    terminalStatus?: "success" | "failed" | "skipped";
    warningMessage?: string;
    errorMessage?: string;
    telegramMessageId?: number;
    telegramErrorCode?: number;
  }): Promise<PromotionDeliveryRecord> {
    const client = await getPool().connect();
    try {
      await client.query("begin");
      const terminalStatus = input.terminalStatus ?? (input.success ? "success" : "failed");
      if (input.success && terminalStatus !== "success") {
        throw new Error("Successful delivery attempts must use success terminal status.");
      }
      const outcome: PromotionDeliveryOutcome = input.success
        ? (input.warningMessage ? "warning" : "success")
        : "failed";

      const deliveryResult = await client.query(
        `update public.promotion_deliveries
         set status = $2,
             telegram_message_id = $3,
             warning_message = $4,
             error_message = $5,
             published_at = case when $2 = 'success' then coalesce(published_at, now()) else published_at end,
             updated_at = now()
         where id = $1 and status = 'in_progress' and attempt_count = $6
         returning ${deliverySelect}`,
        [
          input.deliveryId,
          terminalStatus,
          input.telegramMessageId ?? null,
          input.warningMessage ?? null,
          input.errorMessage ?? null,
          input.attemptNumber,
        ]
      );
      if (!deliveryResult.rows[0]) throw new Error("DELIVERY_STATE_CONFLICT");

      await client.query(
        `insert into public.promotion_delivery_attempts
          (delivery_id, attempt_number, outcome, telegram_message_id, telegram_error_code,
           warning_message, error_message)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          input.deliveryId,
          input.attemptNumber,
          outcome,
          input.telegramMessageId ?? null,
          input.telegramErrorCode ?? null,
          input.warningMessage ?? null,
          input.errorMessage ?? null,
        ]
      );

      await client.query("commit");
      return mapDelivery(deliveryResult.rows[0]);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async getDeliverySummary(campaignId: string): Promise<PromotionDeliverySummary> {
    const result = await getPool().query(
      `select
         count(*)::int as total,
         count(*) filter (where d.status = 'pending')::int as pending,
         count(*) filter (where d.status = 'in_progress')::int as in_progress,
         count(*) filter (where d.status = 'success')::int as succeeded,
         count(*) filter (where d.status = 'failed')::int as failed,
         count(*) filter (where d.status = 'skipped')::int as skipped,
         count(*) filter (where d.warning_message is not null)::int as warnings
       from public.promotion_deliveries d
       join public.promotion_campaign_posts cp on cp.id = d.campaign_post_id
       where cp.campaign_id = $1`,
      [campaignId]
    );
    const row = result.rows[0];
    return {
      total: Number(row.total),
      pending: Number(row.pending),
      inProgress: Number(row.in_progress),
      succeeded: Number(row.succeeded),
      failed: Number(row.failed),
      skipped: Number(row.skipped),
      warnings: Number(row.warnings),
    };
  }

  async refreshCampaignOutcome(campaignId: string): Promise<PromotionCampaignRecord | null> {
    const summary = await this.getDeliverySummary(campaignId);
    let status: PromotionCampaignStatus;
    if (summary.total === 0) status = "draft";
    else if (summary.pending > 0 || summary.inProgress > 0) status = "running";
    else if (summary.succeeded === summary.total) status = "completed";
    else if (summary.succeeded > 0) status = "partial";
    else status = "failed";

    const terminal = status === "completed" || status === "partial" || status === "failed";
    const result = await getPool().query(
      `update public.promotion_campaigns
       set status = $2,
           completed_at = case when $3 then now() else null end,
           updated_at = now()
       where id = $1
       returning ${campaignSelect}`,
      [campaignId, status, terminal]
    );
    return result.rows[0] ? mapCampaign(result.rows[0]) : null;
  }
}

export default new PromotionCampaignRepository();
