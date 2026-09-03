import { getPostgresPool } from "../utils/postgresPool";

/**
 * Compatibility repository for legacy authentication/bootstrap only.
 *
 * IMPORTANT: user application data (Sources, Filters, AI configuration,
 * Destinations, Content Inbox, Promotions, etc.) is never read or written here.
 * Those domains are tenant-scoped through dedicated owner-aware repositories.
 */
export class RuntimeSettingsRepository {
  async read(): Promise<any | null> {
    const pool = getPostgresPool();

    const legacyResult = await pool.query(
      `
        select data
        from public.curator_settings
        where id = 'default'
        limit 1
      `
    );

    const legacy = legacyResult.rows[0]?.data ?? {};
    const legacyDestination = legacy.destination ?? {};

    return {
      // Empty application defaults are intentional. Authenticated production
      // requests overlay all of these fields from owner-scoped repositories.
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
      aiConfig: {
        provider: "gemini",
        model: "gemini-3.5-flash",
      },
      posts: [],
      passwordHash: legacy.passwordHash,
      users: Array.isArray(legacy.users) ? legacy.users : [],
      // Keep only the legacy credential in server memory for transitional
      // compatibility. It is never returned by authenticated settings routes.
      __legacyDestinationBotToken:
        typeof legacyDestination.botToken === "string"
          ? legacyDestination.botToken
          : "",
    };
  }

  async write(settings: any): Promise<boolean> {
    const pool = getPostgresPool();
    const client = await pool.connect();

    try {
      await client.query("begin");

      const legacyResult = await client.query(
        `
          select data
          from public.curator_settings
          where id = 'default'
          for update
        `
      );
      const currentLegacy = legacyResult.rows[0]?.data ?? {};
      const currentDestination = currentLegacy.destination ?? {};

      // This table now exists only for legacy account/session compatibility.
      // Never copy tenant application configuration into this document.
      const compatibilityData = {
        ...currentLegacy,
        passwordHash:
          settings?.passwordHash ?? currentLegacy.passwordHash,
        users: Array.isArray(settings?.users)
          ? settings.users
          : currentLegacy.users ?? [],
        destination: {
          ...currentDestination,
          // Preserve the old credential only until legacy accounts are retired.
          // Do not accept a browser-supplied replacement here.
          botToken: currentDestination.botToken ?? "",
        },
      };

      // Explicitly remove application configuration that used to be stored in
      // this global JSON document. Owner-aware normalized tables are authoritative.
      delete compatibilityData.channels;
      delete compatibilityData.filters;
      delete compatibilityData.aiConfig;
      delete compatibilityData.posts;

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
