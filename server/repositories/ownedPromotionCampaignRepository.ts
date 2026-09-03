import { getPostgresPool } from "../utils/postgresPool";
import {
  PromotionCampaignRepository,
  type CreateCampaignInput,
  type PromotionCampaignRecord,
  type PromotionSourcePostRecord,
} from "./promotionCampaignRepository";

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

const campaignSelect =
  "id, name, description, status, created_by_username, started_at, completed_at, created_at, updated_at";

export class OwnedPromotionCampaignRepository extends PromotionCampaignRepository {
  private readonly ownerPrincipal: string;

  constructor(ownerPrincipal: string) {
    super();
    const owner = ownerPrincipal.trim().toLowerCase();
    if (!owner) throw new Error("Promotion campaign owner principal is required.");
    this.ownerPrincipal = owner;
  }

  async listCampaigns(limit = 100): Promise<PromotionCampaignRecord[]> {
    const { rows } = await getPostgresPool().query(
      `
        select ${campaignSelect}
        from public.promotion_campaigns
        where owner_principal = $1
        order by created_at desc
        limit $2
      `,
      [this.ownerPrincipal, limit]
    );
    return rows.map(mapCampaign);
  }

  async getCampaign(id: string): Promise<PromotionCampaignRecord | null> {
    const { rows } = await getPostgresPool().query(
      `
        select ${campaignSelect}
        from public.promotion_campaigns
        where id = $1
          and owner_principal = $2
        limit 1
      `,
      [id, this.ownerPrincipal]
    );
    return rows[0] ? mapCampaign(rows[0]) : null;
  }

  async createCampaign(
    input: CreateCampaignInput
  ): Promise<PromotionCampaignRecord> {
    const { rows } = await getPostgresPool().query(
      `
        insert into public.promotion_campaigns
          (owner_principal, name, description, created_by_username)
        values ($1,$2,$3,$4)
        returning ${campaignSelect}
      `,
      [
        this.ownerPrincipal,
        input.name,
        input.description ?? null,
        input.createdByUsername ?? null,
      ]
    );
    return mapCampaign(rows[0]);
  }

  async getSourcePost(postId: string): Promise<PromotionSourcePostRecord | null> {
    const { rows } = await getPostgresPool().query(
      `
        select
          p.id,
          p.channel_username,
          p.original_text,
          coalesce(ui.edited_text, p.original_text) as edited_text,
          p.photo_url,
          p.video_url,
          p.telegram_url,
          ui.status,
          p.published_at
        from public.user_inbox_items ui
        join public.posts p on p.id = ui.post_id
        where ui.owner_principal = $1
          and ui.post_id = $2
        limit 1
      `,
      [this.ownerPrincipal, postId]
    );
    return rows[0] ? mapSourcePost(rows[0]) : null;
  }
}
