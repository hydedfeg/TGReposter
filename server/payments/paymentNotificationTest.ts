type Environment = Record<string, string | undefined>;

export interface PaymentNotificationStatus {
  journalEnabled: boolean;
  telegramDeliveryEnabled: boolean;
  tokenPresent: boolean;
  chatPresent: boolean;
  testEnabled: boolean;
  readyForTest: boolean;
  readyForDelivery: boolean;
}

// Do not expose actual bot token, chat ID, merchant address or Telegram API responses.
function credentialState(env: Environment) {
  const token = env.CRYPTO_PAYMENT_ALERT_TELEGRAM_BOT_TOKEN?.trim() ?? "";
  const chat = env.CRYPTO_PAYMENT_ALERT_TELEGRAM_CHAT_ID?.trim() ?? "";
  return {
    tokenPresent: /^\d+:[A-Za-z0-9_-]{20,}$/.test(token),
    chatPresent: /^-?\d+$/.test(chat),
  };
}

export function getPaymentNotificationStatus(
  env: Environment = process.env
): PaymentNotificationStatus {
  const journalEnabled = env.CRYPTO_PAYMENT_ALERTS_ENABLED?.toLowerCase() === "true";
  const telegramDeliveryEnabled = env.CRYPTO_PAYMENT_ALERT_TELEGRAM_ENABLED?.toLowerCase() === "true";
  const testEnabled = env.CRYPTO_PAYMENT_ALERT_TEST_ENABLED?.toLowerCase() === "true";
  const { tokenPresent, chatPresent } = credentialState(env);
  return {
    journalEnabled,
    telegramDeliveryEnabled,
    tokenPresent,
    chatPresent,
    testEnabled,
    readyForTest: journalEnabled && testEnabled && tokenPresent && chatPresent,
    readyForDelivery: journalEnabled && telegramDeliveryEnabled && tokenPresent && chatPresent,
  };
}

export type TelegramTestResult =
  | { ok: true; code: "TEST_SENT" }
  | { ok: false; code: "TEST_UNAVAILABLE" | "TEST_RATE_LIMITED" | "TEST_DELIVERY_FAILED" };

const TEST_COOLDOWN_MS = 60_000;
let lastTestAttemptMs = Number.NEGATIVE_INFINITY;

/**
 * Explicit super-admin action only. This is independent of automatic alert
 * delivery, and never writes invoices, payment events or the alert journal.
 * A short process-local cooldown prevents accidental repeated test messages.
 */
export async function sendPaymentNotificationTest(
  env: Environment = process.env,
  send: typeof fetch = fetch,
  nowMs: number = Date.now()
): Promise<TelegramTestResult> {
  if (!getPaymentNotificationStatus(env).readyForTest) {
    return { ok: false, code: "TEST_UNAVAILABLE" };
  }
  if (!Number.isFinite(nowMs) || nowMs - lastTestAttemptMs < TEST_COOLDOWN_MS) {
    return { ok: false, code: "TEST_RATE_LIMITED" };
  }
  lastTestAttemptMs = nowMs;

  try {
    const token = env.CRYPTO_PAYMENT_ALERT_TELEGRAM_BOT_TOKEN!.trim();
    const chatId = env.CRYPTO_PAYMENT_ALERT_TELEGRAM_CHAT_ID!.trim();
    const response = await send(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "TGReposter payment operations: test notification. No payment was created, changed, or credited.",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) return { ok: false, code: "TEST_DELIVERY_FAILED" };
    const data: unknown = await response.json();
    if (data && typeof data === "object" && "ok" in data && data.ok === true) {
      return { ok: true, code: "TEST_SENT" };
    }
    return { ok: false, code: "TEST_DELIVERY_FAILED" };
  } catch {
    return { ok: false, code: "TEST_DELIVERY_FAILED" };
  }
}
