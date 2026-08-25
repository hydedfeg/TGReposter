export interface TelegramBotIdentity {
  id: number;
  username?: string;
  firstName?: string;
}

export interface TelegramTargetIdentity {
  id: number | string;
  title?: string;
  username?: string;
  type: string;
}

export interface TelegramTargetPermissions {
  status?: string;
  canPostMessages?: boolean;
}

export interface TelegramTargetVerification {
  formattedChatId: string;
  bot: TelegramBotIdentity;
  target: TelegramTargetIdentity;
  permissions?: TelegramTargetPermissions;
}

export class TelegramVerificationError extends Error {
  stage: "bot" | "target" | "permissions" | "send" | "network";

  constructor(stage: TelegramVerificationError["stage"], message: string) {
    super(message);
    this.name = "TelegramVerificationError";
    this.stage = stage;
  }
}

export function formatTelegramChatId(rawChatId: string): string {
  const trimmed = rawChatId.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("@") || trimmed.startsWith("-") || !Number.isNaN(Number(trimmed))) {
    return trimmed;
  }
  return `@${trimmed}`;
}

async function callTelegram(
  botToken: string,
  method: string,
  payload: Record<string, unknown> = {}
): Promise<{ response: Response; data: any }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const rawBody = await response.text();
    let data: any = {};
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      data = {
        ok: false,
        description: `Telegram returned an invalid response (HTTP ${response.status}).`,
      };
    }
    return { response, data };
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new TelegramVerificationError("network", "Telegram verification timed out after 30 seconds.");
    }
    throw new TelegramVerificationError("network", error?.message || "Could not reach the Telegram Bot API.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifyTelegramBot(botToken: string): Promise<TelegramBotIdentity> {
  const botCheck = await callTelegram(botToken, "getMe");
  if (!botCheck.response.ok || !botCheck.data.ok) {
    throw new TelegramVerificationError(
      "bot",
      `Bot token validation failed: ${botCheck.data.description || "Telegram rejected the bot token."}`
    );
  }

  return {
    id: botCheck.data.result.id,
    username: botCheck.data.result.username,
    firstName: botCheck.data.result.first_name,
  };
}

export async function verifyTelegramTarget(
  botToken: string,
  rawChatId: string,
  sendTestMessage = true
): Promise<TelegramTargetVerification> {
  const formattedChatId = formatTelegramChatId(rawChatId);
  if (!formattedChatId) {
    throw new TelegramVerificationError("target", "Telegram target channel/group ID is empty.");
  }

  const bot = await verifyTelegramBot(botToken);

  const chatCheck = await callTelegram(botToken, "getChat", { chat_id: formattedChatId });
  if (!chatCheck.response.ok || !chatCheck.data.ok) {
    throw new TelegramVerificationError(
      "target",
      `Target validation failed for ${formattedChatId}: ${chatCheck.data.description || "Telegram could not resolve this chat."}`
    );
  }

  const chat = chatCheck.data.result;
  const target: TelegramTargetIdentity = {
    id: chat.id,
    title: chat.title,
    username: chat.username,
    type: chat.type,
  };

  const memberCheck = await callTelegram(botToken, "getChatMember", {
    chat_id: formattedChatId,
    user_id: bot.id,
  });

  let permissions: TelegramTargetPermissions | undefined;
  if (memberCheck.response.ok && memberCheck.data.ok) {
    const member = memberCheck.data.result;
    permissions = {
      status: member.status,
      canPostMessages: member.can_post_messages,
    };

    if (member.status === "left" || member.status === "kicked") {
      throw new TelegramVerificationError(
        "permissions",
        `The bot is not an active member of ${formattedChatId}. Add the bot to the target before publishing.`
      );
    }

    if (chat.type === "channel" && member.status !== "administrator" && member.status !== "creator") {
      throw new TelegramVerificationError(
        "permissions",
        `The bot is not an administrator of ${formattedChatId}. Channel publishing requires bot administrator access.`
      );
    }

    if (chat.type === "channel" && member.status === "administrator" && member.can_post_messages === false) {
      throw new TelegramVerificationError(
        "permissions",
        `The bot is an administrator of ${formattedChatId}, but it does not have permission to post messages.`
      );
    }
  }

  if (sendTestMessage) {
    const sendCheck = await callTelegram(botToken, "sendMessage", {
      chat_id: formattedChatId,
      text: "🤖 TGReposter promotion target connection test successful.",
      disable_notification: true,
    });

    if (!sendCheck.response.ok || !sendCheck.data.ok) {
      throw new TelegramVerificationError(
        "send",
        `Telegram could not publish to ${formattedChatId}: ${sendCheck.data.description || "Message delivery failed."}`
      );
    }
  }

  return { formattedChatId, bot, target, permissions };
}
