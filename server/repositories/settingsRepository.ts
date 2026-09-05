import { getPostgresPool } from "../utils/postgresPool";

const INBOX_WINDOW_HOURS = 24;
const VALID_CHANNEL_STATUSES = new Set(["idle", "fetching", "success", "error"]);
const VALID_TARGET_STATUSES = new Set(["idle", "success", "error"]);
const VALID_INBOX_DEFAULT_STATUSES = new Set(["pending", "archived"]);

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

function cleanOwnerPrincipal(value: string): string {
  const ownerPrincipal = value.trim().toLowerCase();
  if (!ownerPrincipal) {
    throw new Error("Runtime settings owner principal is required.");
  }
  return ownerPrincipal;
}

export class RuntimeSettingsRepository {
  async read(ownerPrincipal?: string): Promise<any | null> {
    if (ownerPrincipal) {
      return this.readOwned(ownerPrincipal);
    }

    // Ownerless reads support authentication and system administration only.
    // They deliberately return no application data, preventing a caller without
    // an authenticated owner from observing any member's workspace.
    const { rows } = await getPostgresPool().query(`
      select data
      from public.curator_settings
      where id = 'default'
      limit 1
    `);
    const legacy = rows[0]?.data ?? {};

    return {
      channels: [],
      filters: {
        positiveKeywords: [],
        negativeKeywords: [],
        requiredHashtags: [],
        caseSensitive: false,
      },
      destination: {
        botToken: "",
        botTokenConfigured: false,
        channelId: "",
        connected: false,
        targets: [],
      },
      aiConfig: { provider: "gemini", model: "gemini-3.5-flash" },
      posts: [],
      passwordHash: legacy.passwordHash,
      users: Array.isArray(legacy.users) ? legacy.users : [],
    };
  }

  async write(settings: any, ownerPrincipal?: string): Promise<boolean> {
    if (ownerPrincipal) {
      return this.writeOwned(ownerPrincipal, settings);
    }

    // Ownerless production writes are limited to legacy authentication
    // compatibility. Application configuration and content must always use
    // writeOwned() so one account can never mutate another account's data.
    const compatibilityData: Record<string, unknown> = {};
    if (Object.prototype.hasOwnProperty.call(settings ?? {}, "passwordHash")) {
      compatibilityData.passwordHash = settings.passwordHash ?? null;
    }
    if (Array.isArray(settings?.users)) {
      compatibilityData.users = settings.users;
    }

    if (Object.keys(compatibilityData).length === 0) return true;

    await getPostgresPool().query(
      `
        insert into public.curator_settings (id, data, updated_at)
        values ('default', $1::jsonb, now())
        on conflict (id) do update
        set data = coalesce(public.curator_settings.data, '{}'::jsonb) || excluded.data,
            updated_at = now()
      `,
      [JSON.stringify(compatibilityData)]
    );

    return true;
  }

  private async readOwned(ownerPrincipal: string): Promise<any> {
    const owner = cleanOwnerPrincipal(ownerPrincipal);
    const pool = getPostgresPool();

    const [legacyResult, channelsResult, filtersResult, aiResult, targetsResult, postsResult] =
      await Promise.all([
        pool.query(`
          select data
          from public.curator_settings
          where id = 'default'
          limit 1
        `),
        pool.query(
          `
            select username, display_name, enabled, last_scan_at, status, error_message
            from public.source_channels
            where owner_principal = $1
            order by created_at asc, username asc
          `,
          [owner]
        ),
        pool.query(
          `
            select positive_keywords, negative_keywords, required_hashtags, case_sensitive
            from public.filters
            where owner_principal = $1
            order by updated_at desc nulls last, created_at desc
            limit 1
          `,
          [owner]
        ),
        pool.query(
          `
            select provider, model
            from public.ai_settings
            where owner_principal = $1
            order by updated_at desc nulls last
            limit 1
          `,
          [owner]
        ),
        pool.query(
          `
            select id, client_id, name, channel_id, enabled, status, error_message
            from public.destination_targets
            where owner_principal = $1
            order by created_at asc, id asc
          `,
          [owner]
        ),
        pool.query(
          `
            select id, channel_username, original_text, media_type,
                   photo_url, video_url, telegram_url, inbox_default_status,
                   published_at
            from public.posts
            where owner_principal = $1
              and coalesce(published_at, created_at) >= now() - make_interval(hours => $2)
            order by published_at desc nulls last, created_at desc
            limit 400
          `,
          [owner, INBOX_WINDOW_HOURS]
        ),
      ]);

    const legacy = legacyResult.rows[0]?.data ?? {};
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
        botToken: "",
        botTokenConfigured: false,
        channelId: "",
        connected: targetsResult.rows.length > 0,
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
        ? { provider: ai.provider, model: ai.model }
        : { provider: "gemini", model: "gemini-3.5-flash" },
      posts: postsResult.rows.map(row => ({
        id: row.id,
        channelUsername: row.channel_username,
        originalText: row.original_text,
        text: row.original_text,
        mediaType: row.media_type ?? undefined,
        photoUrl: row.photo_url ?? undefined,
        videoUrl: row.video_url ?? undefined,
        date: asIso(row.published_at) ?? new Date().toISOString(),
        url: row.telegram_url ?? "",
        status: sanitizeStatus(
          row.inbox_default_status,
          VALID_INBOX_DEFAULT_STATUSES,
          "pending"
        ),
      })),
      passwordHash: legacy.passwordHash,
      users: Array.isArray(legacy.users) ? legacy.users : [],
    };
  }

  private async writeOwned(ownerPrincipal: string, settings: any): Promise<boolean> {
    const owner = cleanOwnerPrincipal(ownerPrincipal);
    const pool = getPostgresPool();
    const client = await pool.connect();

    try {
      await client.query("begin");

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
          delete from public.source_channels existing
          where existing.owner_principal = $1
            and not exists (
              select 1
              from jsonb_to_recordset($2::jsonb) as incoming(username text)
              where incoming.username = existing.username
            )
        `,
        [owner, JSON.stringify(channels)]
      );

      if (channels.length > 0) {
        await client.query(
          `
            insert into public.source_channels
              (owner_principal, username, display_name, enabled, last_scan_at,
               status, error_message, updated_at)
            select
              $1,
              incoming.username,
              incoming.display_name,
              incoming.enabled,
              incoming.last_scan_at,
              incoming.status,
              incoming.error_message,
              now()
            from jsonb_to_recordset($2::jsonb) as incoming(
              username text,
              display_name text,
              enabled boolean,
              last_scan_at timestamptz,
              status text,
              error_message text
            )
            on conflict (owner_principal, username) do update
            set display_name = excluded.display_name,
                enabled = excluded.enabled,
                last_scan_at = excluded.last_scan_at,
                status = excluded.status,
                error_message = excluded.error_message,
                updated_at = now()
          `,
          [owner, JSON.stringify(channels)]
        );
      }

      const filters = settings?.filters ?? {};
      await client.query(
        `
          insert into public.filters
            (owner_principal, positive_keywords, negative_keywords,
             required_hashtags, case_sensitive, created_at, updated_at)
          values ($1, $2::text[], $3::text[], $4::text[], $5, now(), now())
          on conflict (owner_principal) do update
          set positive_keywords = excluded.positive_keywords,
              negative_keywords = excluded.negative_keywords,
              required_hashtags = excluded.required_hashtags,
              case_sensitive = excluded.case_sensitive,
              updated_at = now()
        `,
        [
          owner,
          Array.isArray(filters.positiveKeywords) ? filters.positiveKeywords : [],
          Array.isArray(filters.negativeKeywords) ? filters.negativeKeywords : [],
          Array.isArray(filters.requiredHashtags) ? filters.requiredHashtags : [],
          !!filters.caseSensitive,
        ]
      );

      const aiConfig = settings?.aiConfig ?? {};
      await client.query(
        `
          insert into public.ai_settings (owner_principal, provider, model, updated_at)
          values ($1, $2, $3, now())
          on conflict (owner_principal) do update
          set provider = excluded.provider,
              model = excluded.model,
              updated_at = now()
        `,
        [
          owner,
          typeof aiConfig.provider === "string" && aiConfig.provider
            ? aiConfig.provider
            : "gemini",
          typeof aiConfig.model === "string" && aiConfig.model
            ? aiConfig.model
            : "gemini-3.5-flash",
        ]
      );

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
