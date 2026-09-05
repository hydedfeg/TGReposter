import { getPostgresPool } from "../utils/postgresPool";

export interface PostEntity {
  id: string;
  channel_username: string;
  original_text: string;
  edited_text: string;
  media_type?: "photo" | "video" | null;
  photo_url?: string | null;
  video_url?: string | null;
  telegram_url: string;
  published_at: string;
  posted_at?: string | null;
  error_message?: string | null;
  status: string;
  inbox_default_status?: "pending" | "archived";
}

function cleanOwnerPrincipal(value: string): string {
  const ownerPrincipal = value.trim().toLowerCase();
  if (!ownerPrincipal) {
    throw new Error("Post owner principal is required.");
  }
  return ownerPrincipal;
}

export class PostRepository {
  async upsertMany(ownerPrincipal: string, posts: PostEntity[]) {
    if (!posts.length) return [];

    const owner = cleanOwnerPrincipal(ownerPrincipal);
    const pool = getPostgresPool();
    const { rows } = await pool.query(
      `
        insert into public.posts
          (owner_principal, id, channel_username, original_text, edited_text, media_type,
           photo_url, video_url, telegram_url, published_at, posted_at,
           error_message, status, inbox_default_status, updated_at)
        select
          $1,
          x.id,
          x.channel_username,
          x.original_text,
          x.edited_text,
          x.media_type,
          x.photo_url,
          x.video_url,
          x.telegram_url,
          x.published_at,
          x.posted_at,
          x.error_message,
          x.status,
          coalesce(x.inbox_default_status, 'pending'),
          now()
        from jsonb_to_recordset($2::jsonb) as x(
          id text,
          channel_username text,
          original_text text,
          edited_text text,
          media_type text,
          photo_url text,
          video_url text,
          telegram_url text,
          published_at timestamptz,
          posted_at timestamptz,
          error_message text,
          status text,
          inbox_default_status text
        )
        on conflict (owner_principal, id) do update
        set channel_username = excluded.channel_username,
            original_text = excluded.original_text,
            edited_text = excluded.edited_text,
            media_type = excluded.media_type,
            photo_url = excluded.photo_url,
            video_url = excluded.video_url,
            telegram_url = excluded.telegram_url,
            published_at = excluded.published_at,
            posted_at = excluded.posted_at,
            error_message = excluded.error_message,
            status = excluded.status,
            inbox_default_status = excluded.inbox_default_status,
            updated_at = now()
        returning *
      `,
      [owner, JSON.stringify(posts)]
    );

    return rows;
  }

  async getByIds(ownerPrincipal: string, ids: string[]) {
    if (!ids.length) return [];

    const owner = cleanOwnerPrincipal(ownerPrincipal);
    const pool = getPostgresPool();
    const { rows } = await pool.query(
      `
        select *
        from public.posts
        where owner_principal = $1
          and id = any($2::text[])
      `,
      [owner, ids]
    );

    return rows;
  }

  async getRecent(ownerPrincipal: string, limit = 400) {
    const owner = cleanOwnerPrincipal(ownerPrincipal);
    const pool = getPostgresPool();
    const { rows } = await pool.query(
      `
        select *
        from public.posts
        where owner_principal = $1
          and coalesce(published_at, created_at) >= now() - interval '24 hours'
        order by published_at desc nulls last, created_at desc
        limit $2
      `,
      [owner, limit]
    );

    return rows;
  }

  async count(ownerPrincipal: string) {
    const owner = cleanOwnerPrincipal(ownerPrincipal);
    const pool = getPostgresPool();
    const { rows } = await pool.query(
      `select count(*)::bigint as count from public.posts where owner_principal = $1`,
      [owner]
    );

    return Number(rows[0]?.count ?? 0);
  }
}

export default new PostRepository();
