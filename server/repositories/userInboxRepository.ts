import { getPostgresPool } from "../utils/postgresPool";

const VALID_POST_STATUSES = new Set(["pending", "approved", "posted", "archived"]);

export interface UserInboxStateInput {
  id: string;
  text: string;
  status: "pending" | "approved" | "posted" | "archived";
  postedAt?: string | null;
  errorMessage?: string | null;
}

export interface UserInboxPostRow {
  id: string;
  channel_username: string;
  original_text: string;
  edited_text: string;
  media_type?: "photo" | "video" | null;
  photo_url?: string | null;
  video_url?: string | null;
  telegram_url: string;
  published_at: string;
  status: "pending" | "approved" | "posted" | "archived";
  posted_at?: string | null;
  error_message?: string | null;
}

function cleanOwnerPrincipal(value: string): string {
  const ownerPrincipal = value.trim().toLowerCase();
  if (!ownerPrincipal) {
    throw new Error("Inbox owner principal is required.");
  }
  return ownerPrincipal;
}

function cleanStatus(value: unknown): UserInboxStateInput["status"] {
  if (typeof value === "string" && VALID_POST_STATUSES.has(value)) {
    return value as UserInboxStateInput["status"];
  }
  return "pending";
}

function cleanIso(value: unknown): string | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeState(post: any): UserInboxStateInput {
  const id = typeof post?.id === "string" ? post.id.trim() : "";
  if (!id) {
    throw new Error("Every inbox item requires a post ID.");
  }

  return {
    id,
    text:
      typeof post?.text === "string"
        ? post.text
        : typeof post?.originalText === "string"
          ? post.originalText
          : "",
    status: cleanStatus(post?.status),
    postedAt: cleanIso(post?.postedAt),
    errorMessage:
      typeof post?.errorMessage === "string" && post.errorMessage.trim()
        ? post.errorMessage.trim()
        : null,
  };
}

export class UserInboxRepository {
  async list(ownerPrincipal: string, limit = 400): Promise<UserInboxPostRow[]> {
    const owner = cleanOwnerPrincipal(ownerPrincipal);
    const safeLimit = Math.max(1, Math.min(Number(limit) || 400, 1000));

    const { rows } = await getPostgresPool().query(
      `
        select
          p.id,
          p.channel_username,
          p.original_text,
          coalesce(ui.edited_text, p.original_text) as edited_text,
          p.media_type,
          p.photo_url,
          p.video_url,
          p.telegram_url,
          p.published_at,
          ui.status,
          ui.posted_at,
          ui.error_message
        from public.user_inbox_items ui
        join public.posts p on p.id = ui.post_id
        where ui.owner_principal = $1
          and (
            ui.status in ('posted', 'approved')
            or coalesce(p.published_at, p.created_at) >= now() - interval '24 hours'
          )
        order by
          p.published_at desc nulls last,
          ui.updated_at desc
        limit $2
      `,
      [owner, safeLimit]
    );

    return rows;
  }

  async getById(
    ownerPrincipal: string,
    postId: string
  ): Promise<UserInboxPostRow | null> {
    const owner = cleanOwnerPrincipal(ownerPrincipal);
    const cleanPostId = postId.trim();
    if (!cleanPostId) return null;

    const { rows } = await getPostgresPool().query(
      `
        select
          p.id,
          p.channel_username,
          p.original_text,
          coalesce(ui.edited_text, p.original_text) as edited_text,
          p.media_type,
          p.photo_url,
          p.video_url,
          p.telegram_url,
          p.published_at,
          ui.status,
          ui.posted_at,
          ui.error_message
        from public.user_inbox_items ui
        join public.posts p on p.id = ui.post_id
        where ui.owner_principal = $1
          and ui.post_id = $2
        limit 1
      `,
      [owner, cleanPostId]
    );

    return rows[0] ?? null;
  }

  async ensureItems(
    ownerPrincipal: string,
    rawPosts: unknown
  ): Promise<void> {
    const owner = cleanOwnerPrincipal(ownerPrincipal);
    const states = Array.isArray(rawPosts)
      ? rawPosts.map(normalizeState)
      : [];

    if (states.length === 0) return;

    const uniqueIds = Array.from(new Set(states.map(state => state.id)));
    if (uniqueIds.length !== states.length) {
      throw new Error("Duplicate post IDs are not allowed in an inbox assignment.");
    }

    const pool = getPostgresPool();
    const existing = await pool.query(
      `select id from public.posts where id = any($1::text[])`,
      [uniqueIds]
    );
    const existingIds = new Set(existing.rows.map(row => String(row.id)));
    const statesForExistingPosts = states.filter(state => existingIds.has(state.id));
    if (statesForExistingPosts.length === 0) return;

    await pool.query(
      `
        insert into public.user_inbox_items
          (owner_principal, post_id, edited_text, status, posted_at, error_message, created_at, updated_at)
        select
          $1,
          x.id,
          x.edited_text,
          x.status,
          null,
          null,
          now(),
          now()
        from jsonb_to_recordset($2::jsonb) as x(
          id text,
          edited_text text,
          status text
        )
        on conflict (owner_principal, post_id) do nothing
      `,
      [
        owner,
        JSON.stringify(
          statesForExistingPosts.map(state => ({
            id: state.id,
            edited_text: state.text,
            status: state.status,
          }))
        ),
      ]
    );
  }

  async upsertStates(
    ownerPrincipal: string,
    rawPosts: unknown
  ): Promise<void> {
    const owner = cleanOwnerPrincipal(ownerPrincipal);
    const states = Array.isArray(rawPosts)
      ? rawPosts.map(normalizeState)
      : [];

    if (states.length === 0) return;

    const uniqueIds = Array.from(new Set(states.map(state => state.id)));
    if (uniqueIds.length !== states.length) {
      throw new Error("Duplicate post IDs are not allowed in an inbox update.");
    }

    const pool = getPostgresPool();
    const existing = await pool.query(
      `select id from public.posts where id = any($1::text[])`,
      [uniqueIds]
    );
    const existingIds = new Set(existing.rows.map(row => String(row.id)));
    const unknownIds = uniqueIds.filter(id => !existingIds.has(id));

    if (unknownIds.length > 0) {
      throw new Error(
        `Unknown inbox post ID${unknownIds.length === 1 ? "" : "s"}: ${unknownIds.join(", ")}.`
      );
    }

    await pool.query(
      `
        insert into public.user_inbox_items
          (owner_principal, post_id, edited_text, status, posted_at, error_message, created_at, updated_at)
        select
          $1,
          x.id,
          x.edited_text,
          x.status,
          x.posted_at,
          x.error_message,
          now(),
          now()
        from jsonb_to_recordset($2::jsonb) as x(
          id text,
          edited_text text,
          status text,
          posted_at timestamptz,
          error_message text
        )
        on conflict (owner_principal, post_id) do update
        set edited_text = excluded.edited_text,
            status = excluded.status,
            posted_at = excluded.posted_at,
            error_message = excluded.error_message,
            updated_at = now()
      `,
      [
        owner,
        JSON.stringify(
          states.map(state => ({
            id: state.id,
            edited_text: state.text,
            status: state.status,
            posted_at: state.postedAt ?? null,
            error_message: state.errorMessage ?? null,
          }))
        ),
      ]
    );
  }
}

export default new UserInboxRepository();
