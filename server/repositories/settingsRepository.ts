import { getPostgresPool } from "../utils/postgresPool";

const INBOX_WINDOW_HOURS = 24;
const VALID_CHANNEL_STATUSES = new Set(["idle", "fetching", "success", "error"]);
const VALID_TARGET_STATUSES = new Set(["idle", "success", "error"]);
const VALID_POST_STATUSES = new Set(["pending", "approved", "posted", "archived"]);

function asIso(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function cleanChannelUsername(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/^@/, "").toLowerCase() : "";
}

function sanitizeStatus(value: unknown, allowed: Set<string>, fallback: string): string {
  return typeof value === "string" && allowed.has(value) ? value : fallback;
}

export class RuntimeSettingsRepository {
  async read(): Promise<any | null> {
    const pool = getPostgresPool();

    const [legacyResult, channelsResult, filtersResult, aiResult, targetsResult, postsResult] =
      await Promise.all([
        pool.query(`
          select data
          from public.curator_settings
          where id = 'default'
          limit 1
        `),
        pool.query(`
          select username, display_name, enabled, last_scan_at, status, error_message
          from public.source_channels
          order by created_at asc, username asc
        `),
        pool.query(`
          select positive_keywords, negative_keywords, required_hashtags, case_sensitive
          from public.filters
          order by updated_at desc nulls last, created_at desc
          limit 1
        `),
        pool.query(`
          select provider, model
          from public.ai_settings
          order by updated_at desc nulls last
          limit 1
        `),
        pool.query(`
          select id, client_id, name, channel_id, enabled, status, error_message
          from public.destination_targets
          order by created_at asc, id asc
        `),
        pool.query(`
          select id, channel_username, original_text, edited_text, media_type,
                 photo_url, video_url, telegram_url, status, published_at,
                 posted_at, error_message
          from public.posts
          where status in ('posted', 'approved')
             or coalesce(published_at, created_at) >= now() - make_interval(hours => $1)
          order by published_at desc nulls last, created_at desc
          limit 400
        `, [INBOX_WINDOW_HOURS]),
      ]);

    const legacy = legacyResult.rows[0]?.data ?? {};
    const legacyDestination = legacy.destination ?? {};

    const filters = filtersResult.rows[0];
    const ai = aiResult.rows[0];

    return {
      channels: channelsResult.rows.map(row => ({
        username: row.username,
        name: row.display_name ?? undefined,
        enabled: row.enabled !== false,
        lastFetched: asIso(row.last_scan_at) ?? "",
        status: sanitizeStatus(row.status, VALID_CHANNEL_STATUSES, "idle"),
        errorMessage: row.error_message ?? undefined,
      })),
      filters: filters
        ? {
            positiveKeywords: filters.positive_keywords ?? [],
            negativeKeywords: filters.negative_keywords ?? [],
            requiredHashtags: filters.required_hashtags ?? [],
            caseSensitive: !!filters.case_sensitive,
          }
        : {
            positiveKeywords: [],
            negativeKeywords: [],
            requiredHashtags: [],
            caseSensitive: false,
          },
      destination: {
        botToken: legacyDestination.botToken ?? "",
        channelId: legacyDestination.channelId ?? "",
        connected:
          typeof legacyDestination.connected === "boolean"
            ? legacyDestination.connected
            : targetsResult.rows.length > 0,
        targets: targetsResult.rows.map(row => ({
          id: row.client_id ?? row.id,
          channelId: row.channel_id,
          name: row.name,
          enabled: row.enabled !== false,
          status: sanitizeStatus(row.status, VALID_TARGET_STATUSES, "idle"),
          errorMessage: row.error_message ?? undefined,
        })),
      },
      aiConfig: ai
        ? {
            provider: ai.provider,
            model: ai.model,
          }
        : {
            provider: "gemini",
            model: "gemini-3.5-flash",
          },
      posts: postsResult.rows.map(row => ({
        id: row.id,
        channelUsername: row.channel_username,
        originalText: row.original_text,
        text: row.edited_text ?? row.original_text,
        mediaType: row.media_type ?? undefined,
        photoUrl: row.photo_url ?? undefined,
        videoUrl: row.video_url ?? undefined,
        date: asIso(row.published_at) ?? new Date().toISOString(),
        url: row.telegram_url ?? "",
        status: sanitizeStatus(row.status, VALID_POST_STATUSES, "pending"),
        postedAt: asIso(row.posted_at),
        errorMessage: row.error_message ?? undefined,
      })),
      passwordHash: legacy.passwordHash,
      users: Array.isArray(legacy.users) ? legacy.users : [],
    };
  }

  async write(settings: any): Promise<boolean> {
    const pool = getPostgresPool();
    const client = await pool.connect();

    try {
      await client.query("begin");

      const legacyResult = await client.query(
        `select data from public.curator_settings where id = 'default' for update`
      );
      const currentLegacy = legacyResult.rows[0]?.data ?? {};
      const currentDestination = currentLegacy.destination ?? {};
      const incomingDestination = settings?.destination ?? {};

      const compatibilityData = {
        ...currentLegacy,
        passwordHash: settings?.passwordHash ?? currentLegacy.passwordHash,
        users: Array.isArray(settings?.users) ? settings.users : currentLegacy.users ?? [],
        destination: {
          ...currentDestination,
          botToken:
            typeof incomingDestination.botToken === "string"
              ? incomingDestination.botToken
              : currentDestination.botToken ?? "",
          channelId:
            typeof incomingDestination.channelId === "string"
              ? incomingDestination.channelId
              : currentDestination.channelId ?? "",
          connected:
            typeof incomingDestination.connected === "boolean"
              ? incomingDestination.connected
              : currentDestination.connected ?? false,
        },
      };

      await client.query(
        `
          insert into public.curator_settings (id, data, updated_at)
          values ('default', $1::jsonb, now())
          on conflict (id) do update
          set data = excluded.data,
              updated_at = excluded.updated_at
        `,
        [JSON.stringify(compatibilityData)]
      );

      const channels = Array.isArray(settings?.channels)
        ? settings.channels
            .map((channel: any) => ({
              username: cleanChannelUsername(channel?.username),
              display_name:
                typeof channel?.name === "string" && channel.name.trim()
                  ? channel.name.trim()
                  : null,
              enabled: channel?.enabled !== false,
              last_scan_at: asIso(channel?.lastFetched) ?? null,
              status: sanitizeStatus(channel?.status, VALID_CHANNEL_STATUSES, "idle"),
              error_message:
                typeof channel?.errorMessage === "string" && channel.errorMessage
                  ? channel.errorMessage
                  : null,
            }))
            .filter((channel: any) => channel.username)
        : [];

      await client.query(
        `
          delete from public.source_channels
          where username not in (
            select x.username
            from jsonb_to_recordset($1::jsonb) as x(username text)
          )
        `,
        [JSON.stringify(channels)]
      );

      if (channels.length > 0) {
        await client.query(
          `
            insert into public.source_channels
              (username, display_name, enabled, last_scan_at, status, error_message, updated_at)
            select
              x.username,
              x.display_name,
              x.enabled,
              x.last_scan_at,
              x.status,
              x.error_message,
              now()
            from jsonb_to_recordset($1::jsonb) as x(
              username text,
              display_name text,
              enabled boolean,
              last_scan_at timestamptz,
              status text,
              error_message text
            )
            on conflict (username) do update
            set display_name = excluded.display_name,
                enabled = excluded.enabled,
                last_scan_at = excluded.last_scan_at,
                status = excluded.status,
                error_message = excluded.error_message,
                updated_at = now()
          `,
          [JSON.stringify(channels)]
        );
      }

      const filters = settings?.filters ?? {};
      await client.query("delete from public.filters");
      await client.query(
        `
          insert into public.filters
            (positive_keywords, negative_keywords, required_hashtags, case_sensitive, created_at, updated_at)
          values ($1::text[], $2::text[], $3::text[], $4, now(), now())
        `,
        [
          Array.isArray(filters.positiveKeywords) ? filters.positiveKeywords : [],
          Array.isArray(filters.negativeKeywords) ? filters.negativeKeywords : [],
          Array.isArray(filters.requiredHashtags) ? filters.requiredHashtags : [],
          !!filters.caseSensitive,
        ]
      );

      const aiConfig = settings?.aiConfig ?? {};
      await client.query("delete from public.ai_settings");
      await client.query(
        `
          insert into public.ai_settings (provider, model, updated_at)
          values ($1, $2, now())
        `,
        [
          typeof aiConfig.provider === "string" && aiConfig.provider
            ? aiConfig.provider
            : "gemini",
          typeof aiConfig.model === "string" && aiConfig.model
            ? aiConfig.model
            : "gemini-3.5-flash",
        ]
      );

      const targets = Array.isArray(incomingDestination.targets)
        ? incomingDestination.targets
            .map((target: any) => ({
              client_id:
                typeof target?.id === "string" && target.id.trim()
                  ? target.id.trim()
                  : null,
              name:
                typeof target?.name === "string" && target.name.trim()
                  ? target.name.trim()
                  : typeof target?.channelId === "string"
                    ? target.channelId.trim()
                    : "Telegram Target",
              channel_id:
                typeof target?.channelId === "string" ? target.channelId.trim() : "",
              enabled: target?.enabled !== false,
              status: sanitizeStatus(target?.status, VALID_TARGET_STATUSES, "idle"),
              error_message:
                typeof target?.errorMessage === "string" && target.errorMessage
                  ? target.errorMessage
                  : null,
            }))
            .filter((target: any) => target.channel_id)
        : [];

      await client.query(
        `
          delete from public.destination_targets
          where coalesce(client_id, id::text) not in (
            select coalesce(x.client_id, '')
            from jsonb_to_recordset($1::jsonb) as x(client_id text)
          )
        `,
        [JSON.stringify(targets)]
      );

      for (const target of targets) {
        if (target.client_id) {
          await client.query(
            `
              insert into public.destination_targets
                (client_id, name, channel_id, enabled, status, error_message, created_at, updated_at)
              values ($1, $2, $3, $4, $5, $6, now(), now())
              on conflict (client_id) where client_id is not null do update
              set name = excluded.name,
                  channel_id = excluded.channel_id,
                  enabled = excluded.enabled,
                  status = excluded.status,
                  error_message = excluded.error_message,
                  updated_at = now()
            `,
            [
              target.client_id,
              target.name,
              target.channel_id,
              target.enabled,
              target.status,
              target.error_message,
            ]
          );
        } else {
          await client.query(
            `
              insert into public.destination_targets
                (name, channel_id, enabled, status, error_message, created_at, updated_at)
              values ($1, $2, $3, $4, $5, now(), now())
            `,
            [
              target.name,
              target.channel_id,
              target.enabled,
              target.status,
              target.error_message,
            ]
          );
        }
      }

      const posts = Array.isArray(settings?.posts)
        ? settings.posts.map((post: any) => ({
            id: String(post.id),
            channel_username: String(post.channelUsername ?? ""),
            original_text: String(post.originalText ?? ""),
            edited_text: String(post.text ?? post.originalText ?? ""),
            media_type: post.mediaType ?? null,
            photo_url: post.photoUrl ?? null,
            video_url: post.videoUrl ?? null,
            telegram_url: post.url ?? null,
            status: sanitizeStatus(post.status, VALID_POST_STATUSES, "pending"),
            published_at: asIso(post.date) ?? new Date().toISOString(),
            posted_at: asIso(post.postedAt) ?? null,
            error_message: post.errorMessage ?? null,
          }))
        : [];

      if (posts.length > 0) {
        await client.query(
          `
            insert into public.posts
              (id, channel_username, original_text, edited_text, media_type,
               photo_url, video_url, telegram_url, status, published_at,
               posted_at, error_message, updated_at)
            select
              x.id,
              x.channel_username,
              x.original_text,
              x.edited_text,
              x.media_type,
              x.photo_url,
              x.video_url,
              x.telegram_url,
              x.status,
              x.published_at,
              x.posted_at,
              x.error_message,
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
              status text,
              published_at timestamptz,
              posted_at timestamptz,
              error_message text
            )
            on conflict (id) do update
            set channel_username = excluded.channel_username,
                original_text = excluded.original_text,
                edited_text = excluded.edited_text,
                media_type = excluded.media_type,
                photo_url = excluded.photo_url,
                video_url = excluded.video_url,
                telegram_url = excluded.telegram_url,
                status = excluded.status,
                published_at = excluded.published_at,
                posted_at = excluded.posted_at,
                error_message = excluded.error_message,
                updated_at = now()
          `,
          [JSON.stringify(posts)]
        );
      }

      await client.query("commit");
      return true;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}

export default new RuntimeSettingsRepository();
