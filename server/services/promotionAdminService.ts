import promotionRepository, {
  type PromotionRepository,
  type PromotionTargetChatType,
  type TelegramBotAccountRecord,
  type TelegramBotCredentialSource,
} from "../repositories/promotionRepository";
import {
  resolveTelegramBotToken,
  type LegacySettingsReader,
} from "./telegramCredentialService";
import {
  TelegramVerificationError,
  verifyTelegramBot,
  verifyTelegramTarget,
} from "./telegramBotService";

export class PromotionAdminError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "PromotionAdminError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const credentialSources = new Set<TelegramBotCredentialSource>([
  "legacy_settings",
  "environment",
  "vault",
]);
const chatTypes = new Set<PromotionTargetChatType>(["channel", "group", "supergroup"]);
const envRefPattern = /^[A-Z][A-Z0-9_]{2,127}$/;

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new PromotionAdminError(400, "VALIDATION_ERROR", `${field} is required.`);
  }
  return value.trim();
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new PromotionAdminError(400, "VALIDATION_ERROR", `${field} must be a boolean.`);
  }
  return value;
}

function mapDatabaseError(error: any): never {
  if (error?.code === "23505") {
    throw new PromotionAdminError(409, "DUPLICATE", "A promotion record with the same unique value already exists.");
  }
  if (error?.code === "23503") {
    throw new PromotionAdminError(409, "REFERENCE_CONFLICT", "This record is referenced by other promotion data and cannot be changed or deleted yet.");
  }
  throw error;
}

export class PromotionAdminService {
  constructor(
    private readonly readLegacySettings: LegacySettingsReader,
    private readonly repository: PromotionRepository = promotionRepository
  ) {}

  private async credentialConfigured(account: TelegramBotAccountRecord): Promise<boolean> {
    if (account.credentialSource === "environment") {
      return envRefPattern.test(account.credentialRef) && !!process.env[account.credentialRef]?.trim();
    }
    if (account.credentialSource === "legacy_settings") {
      if (account.credentialRef !== "destination.botToken") return false;
      const settings = await this.readLegacySettings();
      return !!settings.destination?.botToken?.trim();
    }
    return false;
  }

  private async safeBotAccount(account: TelegramBotAccountRecord) {
    return {
      ...account,
      credentialConfigured: await this.credentialConfigured(account),
    };
  }

  async listBotAccounts() {
    const accounts = await this.repository.listBotAccounts();
    return Promise.all(accounts.map(account => this.safeBotAccount(account)));
  }

  async createBotAccount(body: any) {
    const name = requiredText(body?.name, "name");
    const credentialSource = body?.credentialSource as TelegramBotCredentialSource;
    if (!credentialSources.has(credentialSource)) {
      throw new PromotionAdminError(400, "VALIDATION_ERROR", "credentialSource must be legacy_settings, environment, or vault.");
    }

    const credentialRef = requiredText(body?.credentialRef, "credentialRef");
    if (credentialSource === "legacy_settings" && credentialRef !== "destination.botToken") {
      throw new PromotionAdminError(400, "VALIDATION_ERROR", "The supported legacy credential reference is destination.botToken.");
    }
    if (credentialSource === "environment" && !envRefPattern.test(credentialRef)) {
      throw new PromotionAdminError(400, "VALIDATION_ERROR", "Environment credentialRef must be a valid uppercase environment variable name.");
    }

    try {
      const account = await this.repository.createBotAccount({
        name,
        botUsername: typeof body?.botUsername === "string" && body.botUsername.trim() ? body.botUsername.trim().replace(/^@/, "") : undefined,
        credentialSource,
        credentialRef,
        enabled: optionalBoolean(body?.enabled, "enabled"),
      });
      return this.safeBotAccount(account);
    } catch (error) {
      return mapDatabaseError(error);
    }
  }

  async updateBotAccount(id: string, body: any) {
    const existing = await this.repository.getBotAccount(id);
    if (!existing) throw new PromotionAdminError(404, "NOT_FOUND", "Telegram bot account not found.");

    const credentialSource = body?.credentialSource === undefined
      ? undefined
      : body.credentialSource as TelegramBotCredentialSource;
    if (credentialSource !== undefined && !credentialSources.has(credentialSource)) {
      throw new PromotionAdminError(400, "VALIDATION_ERROR", "Invalid credentialSource.");
    }

    const nextSource = credentialSource ?? existing.credentialSource;
    const credentialRef = body?.credentialRef === undefined ? undefined : requiredText(body.credentialRef, "credentialRef");
    const nextRef = credentialRef ?? existing.credentialRef;
    if (nextSource === "legacy_settings" && nextRef !== "destination.botToken") {
      throw new PromotionAdminError(400, "VALIDATION_ERROR", "The supported legacy credential reference is destination.botToken.");
    }
    if (nextSource === "environment" && !envRefPattern.test(nextRef)) {
      throw new PromotionAdminError(400, "VALIDATION_ERROR", "Environment credentialRef must be a valid uppercase environment variable name.");
    }

    try {
      const account = await this.repository.updateBotAccount(id, {
        name: body?.name === undefined ? undefined : requiredText(body.name, "name"),
        botUsername: body?.botUsername === undefined
          ? undefined
          : (typeof body.botUsername === "string" && body.botUsername.trim() ? body.botUsername.trim().replace(/^@/, "") : null),
        credentialSource,
        credentialRef,
        enabled: optionalBoolean(body?.enabled, "enabled"),
      });
      return this.safeBotAccount(account!);
    } catch (error) {
      return mapDatabaseError(error);
    }
  }

  async deleteBotAccount(id: string) {
    try {
      const deleted = await this.repository.deleteBotAccount(id);
      if (!deleted) throw new PromotionAdminError(404, "NOT_FOUND", "Telegram bot account not found.");
      return { success: true };
    } catch (error) {
      if (error instanceof PromotionAdminError) throw error;
      return mapDatabaseError(error);
    }
  }

  async verifyBotAccount(id: string) {
    const account = await this.repository.getBotAccount(id);
    if (!account) throw new PromotionAdminError(404, "NOT_FOUND", "Telegram bot account not found.");

    try {
      const token = await resolveTelegramBotToken(account, this.readLegacySettings);
      const bot = await verifyTelegramBot(token);
      const updated = await this.repository.updateBotAccount(id, { botUsername: bot.username ?? null });
      return {
        success: true,
        bot,
        account: await this.safeBotAccount(updated ?? account),
      };
    } catch (error: any) {
      const stage = error instanceof TelegramVerificationError ? error.stage : "credential";
      throw new PromotionAdminError(400, "BOT_VERIFICATION_FAILED", error?.message || "Telegram bot verification failed.", { stage });
    }
  }

  async listTargets() {
    const [targets, accounts] = await Promise.all([
      this.repository.listTargets(),
      this.repository.listBotAccounts(),
    ]);
    const accountsById = new Map(accounts.map(account => [account.id, account]));

    return targets.map(target => {
      const account = accountsById.get(target.botAccountId);
      return {
        ...target,
        botAccount: account ? {
          id: account.id,
          name: account.name,
          botUsername: account.botUsername,
          enabled: account.enabled,
        } : undefined,
      };
    });
  }

  async createTarget(body: any) {
    const botAccountId = requiredText(body?.botAccountId, "botAccountId");
    const account = await this.repository.getBotAccount(botAccountId);
    if (!account) throw new PromotionAdminError(400, "VALIDATION_ERROR", "Selected Telegram bot account does not exist.");

    const chatType = body?.chatType as PromotionTargetChatType | undefined;
    if (chatType !== undefined && !chatTypes.has(chatType)) {
      throw new PromotionAdminError(400, "VALIDATION_ERROR", "chatType must be channel, group, or supergroup.");
    }

    try {
      return await this.repository.createTarget({
        botAccountId,
        name: requiredText(body?.name, "name"),
        chatId: requiredText(body?.chatId, "chatId"),
        chatType,
        enabled: optionalBoolean(body?.enabled, "enabled"),
      });
    } catch (error) {
      return mapDatabaseError(error);
    }
  }

  async updateTarget(id: string, body: any) {
    const existing = await this.repository.getTarget(id);
    if (!existing) throw new PromotionAdminError(404, "NOT_FOUND", "Promotion target not found.");

    const botAccountId = body?.botAccountId === undefined ? undefined : requiredText(body.botAccountId, "botAccountId");
    if (botAccountId !== undefined && !(await this.repository.getBotAccount(botAccountId))) {
      throw new PromotionAdminError(400, "VALIDATION_ERROR", "Selected Telegram bot account does not exist.");
    }

    const chatType = body?.chatType as PromotionTargetChatType | undefined;
    if (chatType !== undefined && !chatTypes.has(chatType)) {
      throw new PromotionAdminError(400, "VALIDATION_ERROR", "chatType must be channel, group, or supergroup.");
    }

    const chatId = body?.chatId === undefined ? undefined : requiredText(body.chatId, "chatId");
    const connectionChanged =
      (botAccountId !== undefined && botAccountId !== existing.botAccountId) ||
      (chatId !== undefined && chatId !== existing.chatId);

    try {
      return await this.repository.updateTarget(id, {
        botAccountId,
        name: body?.name === undefined ? undefined : requiredText(body.name, "name"),
        chatId,
        chatType,
        enabled: optionalBoolean(body?.enabled, "enabled"),
        ...(connectionChanged ? {
          connectionStatus: "unknown" as const,
          lastCheckedAt: null,
          errorMessage: null,
        } : {}),
      });
    } catch (error) {
      return mapDatabaseError(error);
    }
  }

  async deleteTarget(id: string) {
    try {
      const deleted = await this.repository.deleteTarget(id);
      if (!deleted) throw new PromotionAdminError(404, "NOT_FOUND", "Promotion target not found.");
      return { success: true };
    } catch (error) {
      if (error instanceof PromotionAdminError) throw error;
      return mapDatabaseError(error);
    }
  }

  async testTarget(id: string) {
    const target = await this.repository.getTarget(id);
    if (!target) throw new PromotionAdminError(404, "NOT_FOUND", "Promotion target not found.");

    const account = await this.repository.getBotAccount(target.botAccountId);
    if (!account) throw new PromotionAdminError(409, "REFERENCE_CONFLICT", "Promotion target references a missing bot account.");

    const checkedAt = new Date().toISOString();
    try {
      const token = await resolveTelegramBotToken(account, this.readLegacySettings);
      const verification = await verifyTelegramTarget(token, target.chatId, true);
      if (!chatTypes.has(verification.target.type as PromotionTargetChatType)) {
        throw new TelegramVerificationError("target", `Unsupported Telegram chat type '${verification.target.type}'. Promotion targets must be channels or groups.`);
      }

      const [updatedTarget] = await Promise.all([
        this.repository.updateTarget(id, {
          chatType: verification.target.type as PromotionTargetChatType,
          connectionStatus: "ok",
          lastCheckedAt: checkedAt,
          errorMessage: null,
        }),
        this.repository.updateBotAccount(account.id, { botUsername: verification.bot.username ?? null }),
      ]);

      return {
        success: true,
        target: updatedTarget,
        bot: verification.bot,
        telegramTarget: verification.target,
        permissions: verification.permissions,
      };
    } catch (error: any) {
      const message = error?.message || "Telegram target verification failed.";
      await this.repository.updateTarget(id, {
        connectionStatus: "error",
        lastCheckedAt: checkedAt,
        errorMessage: message,
      });
      const stage = error instanceof TelegramVerificationError ? error.stage : "credential";
      throw new PromotionAdminError(400, "TARGET_VERIFICATION_FAILED", message, { stage });
    }
  }
}
