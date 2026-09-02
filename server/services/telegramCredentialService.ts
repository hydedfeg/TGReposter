import crypto from "crypto";
import type { TelegramBotAccountRecord } from "../repositories/promotionRepository";
import { getPostgresPool } from "../utils/postgresPool";

export interface LegacyDestinationSettings {
  destination?: {
    botToken?: string;
  };
}

export type LegacySettingsReader = () => Promise<LegacyDestinationSettings>;

const ENVIRONMENT_REF_PATTERN = /^[A-Z][A-Z0-9_]{2,127}$/;

export function isCredentialReferenceConfigured(account: TelegramBotAccountRecord): boolean {
  if (account.credentialSource === "environment") {
    return ENVIRONMENT_REF_PATTERN.test(account.credentialRef) && !!process.env[account.credentialRef];
  }

  if (account.credentialSource === "legacy_settings") {
    return account.credentialRef === "destination.botToken";
  }

  // Vault references are intentionally metadata-only until a dedicated vault
  // resolver is implemented. Never guess or expose secret values here.
  return false;
}

export async function resolveTelegramBotToken(
  account: TelegramBotAccountRecord,
  readLegacySettings: LegacySettingsReader
): Promise<string> {
  if (!account.enabled) {
    throw new Error("Telegram bot account is disabled.");
  }

  if (account.credentialSource === "legacy_settings") {
    if (account.credentialRef !== "destination.botToken") {
      throw new Error("Unsupported legacy Telegram credential reference.");
    }

    const settings = await readLegacySettings();
    const token = settings.destination?.botToken?.trim();
    if (!token) {
      throw new Error("The legacy Telegram bot token is not configured.");
    }
    return token;
  }

  if (account.credentialSource === "environment") {
    if (!ENVIRONMENT_REF_PATTERN.test(account.credentialRef)) {
      throw new Error("Telegram credential_ref must be a valid environment variable name.");
    }

    const token = process.env[account.credentialRef]?.trim();
    if (!token) {
      throw new Error(`Telegram credential environment variable '${account.credentialRef}' is not configured.`);
    }
    return token;
  }

  throw new Error("Supabase Vault credential resolution is not enabled yet.");
}


const MAIN_BOT_SECRET_NAME = "tgreposter_main_bot_token";

function cleanMainBotToken(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function getMainTelegramBotToken(): Promise<string> {
  const pool = getPostgresPool();

  const vaultResult = await pool.query(
    `
      select decrypted_secret
      from vault.decrypted_secrets
      where name = $1
      order by created_at desc
      limit 1
    `,
    [MAIN_BOT_SECRET_NAME]
  );

  const vaultToken = cleanMainBotToken(vaultResult.rows[0]?.decrypted_secret);
  if (vaultToken) {
    return vaultToken;
  }

  // Transitional server-only fallback. This lets production deploy before the
  // existing token is copied into Vault without exposing that token to clients.
  const legacyResult = await pool.query(
    `
      select data #>> '{destination,botToken}' as bot_token
      from public.curator_settings
      where id = 'default'
      limit 1
    `
  );

  return cleanMainBotToken(legacyResult.rows[0]?.bot_token);
}

export async function isMainTelegramBotTokenConfigured(): Promise<boolean> {
  const { rows } = await getPostgresPool().query(
    `
      select
        exists (
          select 1
          from vault.secrets
          where name = $1
        )
        or exists (
          select 1
          from public.curator_settings
          where id = 'default'
            and nullif(data #>> '{destination,botToken}', '') is not null
        ) as configured
    `,
    [MAIN_BOT_SECRET_NAME]
  );

  return rows[0]?.configured === true;
}

export async function saveMainTelegramBotToken(rawToken: unknown): Promise<void> {
  const token = cleanMainBotToken(rawToken);
  if (!token) {
    throw new Error("Telegram bot token is required.");
  }

  if (!/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(token)) {
    throw new Error("Telegram bot token format is invalid.");
  }

  const pool = getPostgresPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    const existing = await client.query(
      `
        select id
        from vault.secrets
        where name = $1
        limit 1
        for update
      `,
      [MAIN_BOT_SECRET_NAME]
    );

    if (existing.rows[0]?.id) {
      await client.query(
        `
          select vault.update_secret(
            $1::uuid,
            $2,
            $3,
            $4,
            null
          )
        `,
        [
          existing.rows[0].id,
          token,
          MAIN_BOT_SECRET_NAME,
          "Primary Telegram reposting bot token",
        ]
      );
    } else {
      await client.query(
        `
          select vault.create_secret(
            $1,
            $2,
            $3,
            null
          )
        `,
        [
          token,
          MAIN_BOT_SECRET_NAME,
          "Primary Telegram reposting bot token",
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
}


function userTelegramBotSecretName(ownerPrincipal: string): string {
  const cleanOwner = ownerPrincipal.trim().toLowerCase();
  if (!cleanOwner) {
    throw new Error("Destination owner principal is required.");
  }

  const digest = crypto.createHash("sha256").update(cleanOwner).digest("hex");
  return `tgreposter_destination_bot_${digest}`;
}

export async function getUserTelegramBotToken(
  ownerPrincipal: string
): Promise<string> {
  const secretName = userTelegramBotSecretName(ownerPrincipal);
  const result = await getPostgresPool().query(
    `
      select decrypted_secret
      from vault.decrypted_secrets
      where name = $1
      order by created_at desc
      limit 1
    `,
    [secretName]
  );

  return cleanMainBotToken(result.rows[0]?.decrypted_secret);
}

export async function isUserTelegramBotTokenConfigured(
  ownerPrincipal: string
): Promise<boolean> {
  const secretName = userTelegramBotSecretName(ownerPrincipal);
  const { rows } = await getPostgresPool().query(
    `
      select exists (
        select 1
        from vault.secrets
        where name = $1
      ) as configured
    `,
    [secretName]
  );

  return rows[0]?.configured === true;
}

export async function saveUserTelegramBotToken(
  ownerPrincipal: string,
  rawToken: unknown
): Promise<void> {
  const token = cleanMainBotToken(rawToken);
  if (!token) {
    throw new Error("Telegram bot token is required.");
  }

  if (!/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(token)) {
    throw new Error("Telegram bot token format is invalid.");
  }

  const secretName = userTelegramBotSecretName(ownerPrincipal);
  const pool = getPostgresPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    const existing = await client.query(
      `
        select id
        from vault.secrets
        where name = $1
        limit 1
        for update
      `,
      [secretName]
    );

    if (existing.rows[0]?.id) {
      await client.query(
        `
          select vault.update_secret(
            $1::uuid,
            $2,
            $3,
            $4,
            null
          )
        `,
        [
          existing.rows[0].id,
          token,
          secretName,
          "User-scoped Telegram destination bot token",
        ]
      );
    } else {
      await client.query(
        `
          select vault.create_secret(
            $1,
            $2,
            $3,
            null
          )
        `,
        [
          token,
          secretName,
          "User-scoped Telegram destination bot token",
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
}
