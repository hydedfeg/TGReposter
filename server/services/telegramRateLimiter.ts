import crypto from "crypto";

export type TelegramRateLimitChatType = "channel" | "group" | "supergroup";

export interface TelegramRateLimiterOptions {
  globalIntervalMs?: number;
  chatIntervalMs?: number;
  groupIntervalMs?: number;
  disabled?: boolean;
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

export class TelegramRateLimiter {
  private readonly globalIntervalMs: number;
  private readonly chatIntervalMs: number;
  private readonly groupIntervalMs: number;
  private readonly disabled: boolean;
  private readonly botQueues = new Map<string, Promise<void>>();
  private readonly nextBotAt = new Map<string, number>();
  private readonly nextChatAt = new Map<string, number>();

  constructor(options: TelegramRateLimiterOptions = {}) {
    this.globalIntervalMs = Math.max(0, options.globalIntervalMs ?? 40);
    this.chatIntervalMs = Math.max(0, options.chatIntervalMs ?? 1_050);
    this.groupIntervalMs = Math.max(0, options.groupIntervalMs ?? 3_100);
    this.disabled = options.disabled ?? process.env.TELEGRAM_RATE_LIMIT_DISABLED === "true";
  }

  private botKey(botToken: string) {
    return crypto.createHash("sha256").update(botToken).digest("hex").slice(0, 24);
  }

  async wait(botToken: string, chatId: string, chatType?: TelegramRateLimitChatType) {
    if (this.disabled) return;

    const botKey = this.botKey(botToken);
    const chatKey = `${botKey}:${chatId}`;
    const previous = this.botQueues.get(botKey) ?? Promise.resolve();

    const current = previous.catch(() => undefined).then(async () => {
      const now = Date.now();
      const readyAt = Math.max(
        this.nextBotAt.get(botKey) ?? 0,
        this.nextChatAt.get(chatKey) ?? 0
      );
      if (readyAt > now) await sleep(readyAt - now);

      const reservedAt = Date.now();
      const perChatInterval =
        chatType === "group" || chatType === "supergroup"
          ? this.groupIntervalMs
          : this.chatIntervalMs;

      this.nextBotAt.set(botKey, reservedAt + this.globalIntervalMs);
      this.nextChatAt.set(chatKey, reservedAt + perChatInterval);
    });

    this.botQueues.set(botKey, current);
    try {
      await current;
    } finally {
      if (this.botQueues.get(botKey) === current) this.botQueues.delete(botKey);
    }
  }

  block(botToken: string, chatId: string, seconds: number) {
    if (this.disabled) return;
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const until = Date.now() + Math.ceil(safeSeconds * 1000);
    const botKey = this.botKey(botToken);
    const chatKey = `${botKey}:${chatId}`;
    this.nextBotAt.set(botKey, Math.max(this.nextBotAt.get(botKey) ?? 0, until));
    this.nextChatAt.set(chatKey, Math.max(this.nextChatAt.get(chatKey) ?? 0, until));
  }
}

export default new TelegramRateLimiter();
