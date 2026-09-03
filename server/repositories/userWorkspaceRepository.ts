import { getPostgresPool } from "../utils/postgresPool";

export interface UserSourceChannel {
  username: string;
  name?: string;
  enabled?: boolean;
  lastFetched?: string;
  status?: "idle" | "fetching" | "success" | "error";
  errorMessage?: string;
}

export interface UserFilterConfig {
  positiveKeywords: string[];
  negativeKeywords: string[];
  requiredHashtags: string[];
  caseSensitive: boolean;
}

export interface UserAIConfig {
  provider: "gemini" | "openrouter";
  model: string;
}

export interface UserWorkspaceConfig {
  ownerPrincipal: string;
  channels: UserSourceChannel[];
  filters: UserFilterConfig;
  aiConfig: UserAIConfig;
}

function cleanOwner(value: string) {
  const owner = value.trim().toLowerCase();
  if (!owner) throw new Error("Workspace owner principal is required.");
  return owner;
}

function cleanUsername(value: unknown) {
  return typeof value === "string"
    ? value.trim().replace(/^@/, "").toLowerCase()
    : "";
}

function asIso(value: unknown): string | undefined {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function mapChannel(row: any): UserSourceChannel {
  return {
    username: row.username,
    name: row.display_name ?? undefined,
    enabled: row.enabled !== false,
    lastFetched: asIso(row.last_scan_at) ?? "",
    status: ["idle", "fetching", "success", "error"].includes(row.status)
      ? row.status
      : "idle",
    errorMessage: row.error_message ?? undefined,
  };
}

export class UserWorkspaceRepository {
  async getConfig(ownerPrincipal: string): Promise<UserWorkspaceConfig> {
    const owner = cleanOwner(ownerPrincipal);
    const pool = getPostgresPool();

    const [channelsResult, filtersResult, aiResult] = await Promise.all([
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
          limit 1
        `,
        [owner]
      ),
      pool.query(
        `
          select provider, model
          from public.ai_settings
          where owner_principal = $1
          limit 1
        `,
        [owner]
      ),
    ]);

    const filter = filtersResult.rows[0];
    const ai = aiResult.rows[0];

    return {
      ownerPrincipal: owner,
      channels: channelsResult.rows.map(mapChannel),
      filters: filter
        ? {
            positiveKeywords: filter.positive_keywords ?? [],
            negativeKeywords: filter.negative_keywords ?? [],
            requiredHashtags: filter.required_hashtags ?? [],
            caseSensitive: !!filter.case_sensitive,
          }
        : {
            positiveKeywords: [],
            negativeKeywords: [],
            requiredHashtags: [],
            caseSensitive: false,
          },
      aiConfig: ai
        ? {
            provider: ai.provider === "openrouter" ? "openrouter" : "gemini",
            model: ai.model || "gemini-3.5-flash",
          }
        : {
            provider: "gemini",
            model: "gemini-3.5-flash",
          },
    };
  }

  async listAllConfigs(): Promise<UserWorkspaceConfig[]> {
    const pool = getPostgresPool();
    const ownersResult = await pool.query(
      `
        select owner_principal from public.source_channels
        union
        select owner_principal from public.filters
        union
        select owner_principal from public.ai_settings
        union
        select owner_principal from public.destination_targets
        union
        select owner_principal from public.user_inbox_items
      `
    );

    return Promise.all(
      ownersResult.rows
        .map(row => String(row.owner_principal || "").trim())
        .filter(Boolean)
        .map(owner => this.getConfig(owner))
    );
  }

  async replaceChannels(ownerPrincipal: string, rawChannels: unknown) {
    const owner = cleanOwner(ownerPrincipal);
    const channels = Array.isArray(rawChannels)
      ? rawChannels
          .map((channel: any) => ({
            username: cleanUsername(channel?.username),
            displayName:
              typeof channel?.name === "string" && channel.name.trim()
                ? channel.name.trim()
                : null,
            enabled: channel?.enabled !== false,
            lastScanAt: asIso(channel?.lastFetched) ?? null,
            status: ["idle", "fetching", "success", "error"].includes(channel?.status)
              ? channel.status
              : "idle",
            errorMessage:
              typeof channel?.errorMessage === "string" && channel.errorMessage.trim()
                ? channel.errorMessage.trim()
                : null,
          }))
          .filter(channel => channel.username)
      : [];

    const usernames = channels.map(channel => channel.username);
    if (new Set(usernames).size !== usernames.length) {
      throw new Error("Duplicate source channel usernames are not allowed.");
    }

    const pool = getPostgresPool();
    const client = await pool.connect();
    try {
      await client.query("begin");

      if (channels.length === 0) {
        await client.query(
          "delete from public.source_channels where owner_principal = $1",
          [owner]
        );
      } else {
        await client.query(
          `
            delete from public.source_channels
            where owner_principal = $1
              and not (username = any($2::text[]))
          `,
          [owner, usernames]
        );
      }

      for (const channel of channels) {
        await client.query(
          `
            insert into public.source_channels
              (owner_principal, username, display_name, enabled, last_scan_at, status, error_message, created_at, updated_at)
            values ($1,$2,$3,$4,$5,$6,$7,now(),now())
            on conflict (owner_principal, username) do update
            set display_name = excluded.display_name,
                enabled = excluded.enabled,
                last_scan_at = excluded.last_scan_at,
                status = excluded.status,
                error_message = excluded.error_message,
                updated_at = now()
          `,
          [
            owner,
            channel.username,
            channel.displayName,
            channel.enabled,
            channel.lastScanAt,
            channel.status,
            channel.errorMessage,
          ]
        );
      }

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    return (await this.getConfig(owner)).channels;
  }

  async saveFilters(ownerPrincipal: string, raw: any) {
    const owner = cleanOwner(ownerPrincipal);
    const positive = Array.isArray(raw?.positiveKeywords) ? raw.positiveKeywords : [];
    const negative = Array.isArray(raw?.negativeKeywords) ? raw.negativeKeywords : [];
    const hashtags = Array.isArray(raw?.requiredHashtags) ? raw.requiredHashtags : [];

    await getPostgresPool().query(
      `
        insert into public.filters
          (owner_principal, positive_keywords, negative_keywords, required_hashtags, case_sensitive, created_at, updated_at)
        values ($1,$2::text[],$3::text[],$4::text[],$5,now(),now())
        on conflict (owner_principal) do update
        set positive_keywords = excluded.positive_keywords,
            negative_keywords = excluded.negative_keywords,
            required_hashtags = excluded.required_hashtags,
            case_sensitive = excluded.case_sensitive,
            updated_at = now()
      `,
      [owner, positive, negative, hashtags, !!raw?.caseSensitive]
    );

    return (await this.getConfig(owner)).filters;
  }

  async saveAIConfig(ownerPrincipal: string, raw: any) {
    const owner = cleanOwner(ownerPrincipal);
    const provider = raw?.provider === "openrouter" ? "openrouter" : "gemini";
    const model =
      typeof raw?.model === "string" && raw.model.trim()
        ? raw.model.trim()
        : "gemini-3.5-flash";

    await getPostgresPool().query(
      `
        insert into public.ai_settings
          (owner_principal, provider, model, updated_at)
        values ($1,$2,$3,now())
        on conflict (owner_principal) do update
        set provider = excluded.provider,
            model = excluded.model,
            updated_at = now()
      `,
      [owner, provider, model]
    );

    return (await this.getConfig(owner)).aiConfig;
  }

  async saveScanState(
    ownerPrincipal: string,
    channel: UserSourceChannel
  ) {
    const owner = cleanOwner(ownerPrincipal);
    const username = cleanUsername(channel.username);
    if (!username) return;

    await getPostgresPool().query(
      `
        insert into public.source_channels
          (owner_principal, username, display_name, enabled, last_scan_at, status, error_message, created_at, updated_at)
        values ($1,$2,$3,$4,$5,$6,$7,now(),now())
        on conflict (owner_principal, username) do update
        set display_name = coalesce(excluded.display_name, public.source_channels.display_name),
            enabled = excluded.enabled,
            last_scan_at = coalesce(excluded.last_scan_at, public.source_channels.last_scan_at),
            status = excluded.status,
            error_message = excluded.error_message,
            updated_at = now()
      `,
      [
        owner,
        username,
        channel.name ?? null,
        channel.enabled !== false,
        channel.lastFetched || null,
        channel.status ?? "idle",
        channel.errorMessage ?? null,
      ]
    );
  }
}

export default new UserWorkspaceRepository();
