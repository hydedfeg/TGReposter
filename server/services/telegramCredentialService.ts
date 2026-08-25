import type { TelegramBotAccountRecord } from "../repositories/promotionRepository";

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
