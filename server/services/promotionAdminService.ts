import promotionRepository, {
  type PromotionRepository,
  type PromotionTargetChatType,
  type TelegramBotAccountRecord,
  type TelegramBotCredentialSource,
} from "../repositories/promotionRepository";
import {
  isUserTelegramBotTokenConfigured,
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

  private async credentialConfigured(ownerPrincipal: string, account: TelegramBotAccountRecord): Promise<boolean> {
    if (account.credentialSource === "environment") {
      return envRefPattern.test(account.credentialRef) && !!process.env[account.credentialRef]?.trim();
    }
    if (account.credentialSource === "legacy_settings") {
      if (account.credentialRef !== "destination.botToken") return false;
      return isUserTelegramBotTokenConfigured(ownerPrincipal);
    }
    return false;
  }

  private async safeBotAccount(ownerPrincipal: string, account: TelegramBotAccountRecord) {
    return {
      ...account,
      credentialConfigured: await this.credentialConfigured(ownerPrincipal, account),
    };
  }

  async listBotAccounts(ownerPrincipal: string) {
    const accounts = await this.repository.listBotAccounts(ownerPrincipal);
    return Promise.all(accounts.map(account => this.safeBotAccount(ownerPrincipal, account)));
  }

  async createBotAccount(ownerPrincipal: string, body: any) {
    const name = requiredText(body?.name, "name");
    const credentialSource = body?.credentialSource as TelegramBotCredentialSource;
    const credentialRef = requiredText(body?.credentialRef, "credentialRef");
    if (credentialSource !== "legacy_settings" || credentialRef !== "destination.botToken") {
      throw new PromotionAdminError(
        400,
        "VALIDATION_ERROR",
        "Promotion campaigns can only use your personal Destination Bot credential."
      );
    }

    try {
      const account = await this.repository.createBotAccount(ownerPrincipal, {
        name,
        botUsername: typeof body?.botUsername === "string" && body.botUsername.trim() ? body.botUsername.trim().replace(/^@/, "") : undefined,
        credentialSource,
        credentialRef,
        enabled: optionalBoolean(body?.enabled, "enabled"),
      });
      return this.safeBotAccount(ownerPrincipal, account);
    } catch (error) {
      return mapDatabaseError(error);
    }
  }

  async createPersonalDestinationBot(ownerPrincipal: string) {
    return this.createBotAccount(ownerPrincipal, {
      name: "My Destination Bot",
      credentialSource: "legacy_settings",
      credentialRef: "destination.botToken",
      enabled: true,
    });
  }

  async updateBotAccount(ownerPrincipal: string, id: string, body: any) {
    const existing = await this.repository.getBotAccount(ownerPrincipal, id);
    if (!existing) throw new PromotionAdminError(404, "NOT_FOUND", "Telegram bot account not found.");

    if (body?.credentialSource !== undefined || body?.credentialRef !== undefined) {
      throw new PromotionAdminError(
        400,
        "VALIDATION_ERROR",
        "Promotion bot credentials are managed from your personal Destinations settings."
      );
    }

    try {
      const account = await this.repository.updateBotAccount(ownerPrincipal, id, {
        name: body?.name === undefined ? undefined : requiredText(body.name, "name"),
        botUsername: body?.botUsername === undefined
          ? undefined
          : (typeof body.botUsername === "string" && body.botUsername.trim() ? body.botUsername.trim().replace(/^@/, "") : null),
        enabled: optionalBoolean(body?.enabled, "enabled"),
      });
      return this.safeBotAccount(ownerPrincipal, account!);
    } catch (error) {
      return mapDatabaseError(error);
    }
  }

  async deleteBotAccount(ownerPrincipal: string, id: string) {
    try {
      const deleted = await this.repository.deleteBotAccount(ownerPrincipal, id);
      if (!deleted) throw new PromotionAdminError(404, "NOT_FOUND", "Telegram bot account not found.");
      return { success: true };
    } catch (error) {
      if (error instanceof PromotionAdminError) throw error;
      return mapDatabaseError(error);
    }
  }

  async verifyBotAccount(ownerPrincipal: string, id: string) {
    const account = await this.repository.getBotAccount(ownerPrincipal, id);
    if (!account) throw new PromotionAdminError(404, "NOT_FOUND", "Telegram bot account not found.");

    try {
      const token = await resolveTelegramBotToken(account, this.readLegacySettings, ownerPrincipal);
      const bot = await verifyTelegramBot(token);
      const updated = await this.repository.updateBotAccount(ownerPrincipal, id, { botUsername: bot.username ?? null });
      return {
        success: true,
        bot,
        account: await this.safeBotAccount(ownerPrincipal, updated ?? account),
      };
    } catch (error: any) {
      const stage = error instanceof TelegramVerificationError ? error.stage : "credential";
      throw new PromotionAdminError(400, "BOT_VERIFICATION_FAILED", error?.message || "Telegram bot verification failed.", { stage });
    }
  }

  async listTargets(ownerPrincipal: string) {
    const [targets, accounts] = await Promise.all([
      this.repository.listTargets(ownerPrincipal),
      this.repository.listBotAccounts(ownerPrincipal),
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

  async createTarget(ownerPrincipal: string, body: any) {
    const botAccountId = requiredText(body?.botAccountId, "botAccountId");
    const account = await this.repository.getBotAccount(ownerPrincipal, botAccountId);
    if (!account) throw new PromotionAdminError(400, "VALIDATION_ERROR", "Selected Telegram bot account does not exist.");

    const chatType = body?.chatType as PromotionTargetChatType | undefined;
    if (chatType !== undefined && !chatTypes.has(chatType)) {
      throw new PromotionAdminError(400, "VALIDATION_ERROR", "chatType must be channel, group, or supergroup.");
    }

    try {
      return await this.repository.createTarget(ownerPrincipal, {
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

  async updateTarget(ownerPrincipal: string, id: string, body: any) {
    const existing = await this.repository.getTarget(ownerPrincipal, id);
    if (!existing) throw new PromotionAdminError(404, "NOT_FOUND", "Promotion target not found.");

    const botAccountId = body?.botAccountId === undefined ? undefined : requiredText(body.botAccountId, "botAccountId");
    if (botAccountId !== undefined && !(await this.repository.getBotAccount(ownerPrincipal, botAccountId))) {
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
      return await this.repository.updateTarget(ownerPrincipal, id, {
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

  async deleteTarget(ownerPrincipal: string, id: string) {
    try {
      const deleted = await this.repository.deleteTarget(ownerPrincipal, id);
      if (!deleted) throw new PromotionAdminError(404, "NOT_FOUND", "Promotion target not found.");
      return { success: true };
    } catch (error) {
      if (error instanceof PromotionAdminError) throw error;
      return mapDatabaseError(error);
    }
  }

  async testTarget(ownerPrincipal: string, id: string) {
    const target = await this.repository.getTarget(ownerPrincipal, id);
    if (!target) throw new PromotionAdminError(404, "NOT_FOUND", "Promotion target not found.");

    const account = await this.repository.getBotAccount(ownerPrincipal, target.botAccountId);
    if (!account) throw new PromotionAdminError(409, "REFERENCE_CONFLICT", "Promotion target references a missing bot account.");

    const checkedAt = new Date().toISOString();
    try {
      const token = await resolveTelegramBotToken(account, this.readLegacySettings, ownerPrincipal);
      const verification = await verifyTelegramTarget(token, target.chatId, true);
      if (!chatTypes.has(verification.target.type as PromotionTargetChatType)) {
        throw new TelegramVerificationError("target", `Unsupported Telegram chat type '${verification.target.type}'. Promotion targets must be channels or groups.`);
      }

      const [updatedTarget] = await Promise.all([
        this.repository.updateTarget(ownerPrincipal, id, {
          chatType: verification.target.type as PromotionTargetChatType,
          connectionStatus: "ok",
          lastCheckedAt: checkedAt,
          errorMessage: null,
        }),
        this.repository.updateBotAccount(ownerPrincipal, account.id, { botUsername: verification.bot.username ?? null }),
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
      await this.repository.updateTarget(ownerPrincipal, id, {
        connectionStatus: "error",
        lastCheckedAt: checkedAt,
        errorMessage: message,
      });
      const stage = error instanceof TelegramVerificationError ? error.stage : "credential";
      throw new PromotionAdminError(400, "TARGET_VERIFICATION_FAILED", message, { stage });
    }
  }
}
