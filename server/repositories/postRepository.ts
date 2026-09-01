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
}

export class PostRepository {
  async upsertMany(posts: PostEntity[]) {
    if (!posts.length) return [];

    const pool = getPostgresPool();
    const { rows } = await pool.query(
      `
        insert into public.posts
          (id, channel_username, original_text, edited_text, media_type,
           photo_url, video_url, telegram_url, published_at, posted_at,
           error_message, status, updated_at)
        select
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
          now()
        from jsonb_to_recordset($1::jsonb) as x(
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
          status text
        )
        on conflict (id) do update
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
            updated_at = now()
        returning *
      `,
      [JSON.stringify(posts)]
    );

    return rows;
  }

  async getByIds(ids: string[]) {
    if (!ids.length) return [];

    const pool = getPostgresPool();
    const { rows } = await pool.query(
      `
        select *
        from public.posts
        where id = any($1::text[])
      `,
      [ids]
    );

    return rows;
  }

  async getRecent(limit = 400) {
    const pool = getPostgresPool();
    const { rows } = await pool.query(
      `
        select *
        from public.posts
        where status in ('posted', 'approved')
           or coalesce(published_at, created_at) >= now() - interval '24 hours'
        order by published_at desc nulls last, created_at desc
        limit $1
      `,
      [limit]
    );

    return rows;
  }

  async count() {
    const pool = getPostgresPool();
    const { rows } = await pool.query(
      `select count(*)::bigint as count from public.posts`
    );

    return Number(rows[0]?.count ?? 0);
  }
}

export default new PostRepository();
