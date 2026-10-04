import crypto from "crypto";
import type { PoolClient } from "pg";
import { getPostgresPool } from "../utils/postgresPool";

export type UserAIProvider = "gemini" | "openrouter";

export interface UserAICredentialStatus {
  geminiConfigured: boolean;
  openrouterConfigured: boolean;
}

const AI_PROVIDERS = new Set<UserAIProvider>(["gemini", "openrouter"]);

export function isUserAIProvider(value: unknown): value is UserAIProvider {
  return typeof value === "string" && AI_PROVIDERS.has(value as UserAIProvider);
}

function cleanOwnerPrincipal(ownerPrincipal: string): string {
  const owner = ownerPrincipal.trim().toLowerCase();
  if (!owner) {
    throw new Error("AI credential owner principal is required.");
  }
  return owner;
}

export function normalizeUserAIApiKey(rawValue: unknown): string {
  const value = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!value) {
    throw new Error("API key is required.");
  }
  if (value.length < 16 || value.length > 2048 || /\s/.test(value)) {
    throw new Error("API key format is invalid.");
  }
  return value;
}

function userAISecretName(
  ownerPrincipal: string,
  provider: UserAIProvider
): string {
  const owner = cleanOwnerPrincipal(ownerPrincipal);
  const digest = crypto.createHash("sha256").update(owner).digest("hex");
  return `tgreposter_ai_${provider}_${digest}`;
}

async function lockVaultSecretMutation(
  client: PoolClient,
  secretName: string
): Promise<void> {
  await client.query(
    "select pg_advisory_xact_lock(hashtextextended($1, 0))",
    [secretName]
  );
}

export async function getUserAIApiKey(
  ownerPrincipal: string,
  provider: UserAIProvider
): Promise<string> {
  const secretName = userAISecretName(ownerPrincipal, provider);
  const { rows } = await getPostgresPool().query(
    `
      select decrypted_secret
      from vault.decrypted_secrets
      where name = $1
      order by created_at desc
      limit 1
    `,
    [secretName]
  );

  return typeof rows[0]?.decrypted_secret === "string"
    ? rows[0].decrypted_secret.trim()
    : "";
}

export async function getUserAICredentialStatus(
  ownerPrincipal: string
): Promise<UserAICredentialStatus> {
  const names = {
    gemini: userAISecretName(ownerPrincipal, "gemini"),
    openrouter: userAISecretName(ownerPrincipal, "openrouter"),
  };

  const { rows } = await getPostgresPool().query(
    `
      select name
      from vault.secrets
      where name = any($1::text[])
    `,
    [[names.gemini, names.openrouter]]
  );

  const configured = new Set(
    rows
      .map((row: any) => row?.name)
      .filter((name: unknown): name is string => typeof name === "string")
  );

  return {
    geminiConfigured: configured.has(names.gemini),
    openrouterConfigured: configured.has(names.openrouter),
  };
}

export async function saveUserAIApiKey(
  ownerPrincipal: string,
  provider: UserAIProvider,
  rawApiKey: unknown
): Promise<void> {
  const apiKey = normalizeUserAIApiKey(rawApiKey);
  const secretName = userAISecretName(ownerPrincipal, provider);
  const description =
    provider === "gemini"
      ? "User-scoped Google Gemini API key"
      : "User-scoped OpenRouter API key";

  const pool = getPostgresPool();
  const client = await pool.connect();

  try {
    await client.query("begin");
    await lockVaultSecretMutation(client, secretName);

    const existing = await client.query(
      `
        select id
        from vault.secrets
        where name = $1
        limit 1
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
          apiKey,
          secretName,
          description,
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
          apiKey,
          secretName,
          description,
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


export async function deleteUserAIApiKey(
  ownerPrincipal: string,
  provider: UserAIProvider
): Promise<boolean> {
  const secretName = userAISecretName(ownerPrincipal, provider);
  const pool = getPostgresPool();
  const client = await pool.connect();

  try {
    await client.query("begin");
    await lockVaultSecretMutation(client, secretName);

    const result = await client.query(
      `
        delete from vault.secrets
        where name = $1
        returning id
      `,
      [secretName]
    );

    await client.query("commit");
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
