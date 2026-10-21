import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getPaymentNotificationStatus,
  sendPaymentNotificationTest,
} from "../server/payments/paymentNotificationTest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const botToken = "12345:ABCDEFGHIJKLMNOPQRSTUVWXYZabcd";
const env = {
  CRYPTO_PAYMENT_ALERTS_ENABLED: "true",
  CRYPTO_PAYMENT_ALERT_TEST_ENABLED: "true",
  CRYPTO_PAYMENT_ALERT_TELEGRAM_ENABLED: "false",
  CRYPTO_PAYMENT_ALERT_TELEGRAM_BOT_TOKEN: botToken,
  CRYPTO_PAYMENT_ALERT_TELEGRAM_CHAT_ID: "-1001234567890",
};

test("Telegram status exposes flags but never credentials", () => {
  const status = getPaymentNotificationStatus(env);
  assert.equal(status.journalEnabled, true);
  assert.equal(status.readyForTest, true);
  assert.equal(status.telegramDeliveryEnabled, false);
  assert.equal(status.readyForDelivery, false);
  const serialized = JSON.stringify(status);
  assert.ok(!serialized.includes(botToken));
  assert.ok(!serialized.includes(env.CRYPTO_PAYMENT_ALERT_TELEGRAM_CHAT_ID));

  const missing = getPaymentNotificationStatus({
    ...env, CRYPTO_PAYMENT_ALERT_TELEGRAM_BOT_TOKEN: undefined,
  });
  assert.equal(missing.readyForTest, false);
  assert.equal(missing.tokenPresent, false);
});

test("no test message unless manually enabled and both destination fields are valid", async () => {
  let sends = 0;
  const send = (async () => { sends += 1; throw Error("unexpected request"); }) as any;
  for (const changes of [
    { CRYPTO_PAYMENT_ALERT_TEST_ENABLED: "false" },
    { CRYPTO_PAYMENT_ALERTS_ENABLED: "false" },
    { CRYPTO_PAYMENT_ALERT_TELEGRAM_CHAT_ID: "somechannel" },
    { CRYPTO_PAYMENT_ALERT_TELEGRAM_BOT_TOKEN: "" },
  ]) {
    const outcome = await sendPaymentNotificationTest({ ...env, ...changes }, send, 1_000_000);
    assert.deepEqual(outcome, { ok: false, code: "TEST_UNAVAILABLE" });
  }
  assert.equal(sends, 0);
});

test("explicit synthetic Telegram test sends no payment data and has a cooldown", async () => {
  let requestCount = 0;
  const send = (async (url: string, options: RequestInit) => {
    requestCount += 1;
    assert.ok(url.startsWith("https://api.telegram.org/bot"));
    assert.equal(options.method, "POST");
    const request = JSON.parse(String(options.body));
    assert.equal(request.chat_id, env.CRYPTO_PAYMENT_ALERT_TELEGRAM_CHAT_ID);
    assert.match(request.text, /test notification/i);
    assert.doesNotMatch(request.text, /supabase:|private.key|transaction hash|0x[0-9a-f]{12}/i);
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {status: 200});
  }) as typeof fetch;
  const result = await sendPaymentNotificationTest(env, send, 1_000_000);
  assert.deepEqual(result, {ok: true, code: "TEST_SENT"});
  const second = await sendPaymentNotificationTest(env, send, 1_001_000);
  assert.deepEqual(second, {ok: false, code: "TEST_RATE_LIMITED"});
  assert.equal(requestCount, 1);
});

test("Telegram API 200 without ok=true must fail safely", async () => {
  const result = await sendPaymentNotificationTest(
    env,
    (async () => new Response(JSON.stringify({ok:false, description:"private secret"}), {status:200})) as typeof fetch,
    1_200_000,
  );
  assert.deepEqual(result, {ok:false, code:"TEST_DELIVERY_FAILED"});
  assert.ok(!JSON.stringify(result).includes("private secret"));
});

test("only authenticated super-admins may inspect status or send test", () => {
  const source = readFileSync(resolve(root, "server/routes/cryptoPayments.ts"), "utf8");
  const guard = source.indexOf("router.use(requireSuperAdmin);");
  const status = source.indexOf('router.get("/notifications/status"');
  const manual = source.indexOf('router.post("/notifications/test"');
  assert.ok(guard >= 0 && status > guard && manual > guard);
  assert.match(source, /sendPaymentNotificationTest\(\)/);
  const view = readFileSync(resolve(root, "src/components/CryptoPayments.tsx"), "utf8");
  assert.match(view, /window\.confirm\(/);
  assert.match(view, /notificationStatus\.readyForTest/);
  assert.doesNotMatch(view, /CRYPTO_PAYMENT_ALERT_TELEGRAM_BOT_TOKEN|CRYPTO_PAYMENT_ALERT_TELEGRAM_CHAT_ID/);
});


test("Telegram failure categories produce actionable safe codes without leaking upstream text", async () => {
  const cases: Array<[number, string, string]> = [
    [401, "Unauthorized", "TEST_INVALID_BOT_TOKEN"],
    [400, "Bad Request: chat not found", "TEST_CHAT_NOT_FOUND"],
    [403, "Forbidden: bot was blocked by the user", "TEST_CHAT_FORBIDDEN"],
    [403, "Forbidden: bot was kicked from the group chat", "TEST_CHAT_FORBIDDEN"],
    [400, "Bad Request: not enough rights to send text messages to the chat", "TEST_NO_SEND_PERMISSION"],
    [400, "Bad Request: group chat was upgraded to a supergroup chat", "TEST_CHAT_MIGRATED"],
    [429, "Too Many Requests: retry after 20", "TEST_TELEGRAM_RATE_LIMITED"],
    [502, "Bad Gateway", "TEST_TELEGRAM_UNAVAILABLE"],
    [400, "Bad Request: secret_token_very_sensitive", "TEST_DELIVERY_FAILED"],
  ];
  let now = 4_000_000;
  for (const [status, description, code] of cases) {
    const result = await sendPaymentNotificationTest(
      env,
      (async () => new Response(JSON.stringify({ok:false, description}), {status})) as typeof fetch,
      now,
    );
    assert.deepEqual(result, {ok:false, code});
    assert.ok(!JSON.stringify(result).includes(description));
    now += 61_000;
  }
});

test("Telegram timeout and network errors return distinct non-sensitive diagnostics", async () => {
  const timeout = await sendPaymentNotificationTest(
    env,
    (async () => { const err = new Error("https://api.telegram.org/botSECRET"); err.name = "TimeoutError"; throw err; }) as typeof fetch,
    5_000_000,
  );
  assert.deepEqual(timeout, {ok:false,code:"TEST_CONNECTION_TIMEOUT"});
  const network = await sendPaymentNotificationTest(
    env,
    (async () => { throw Error("DNS lookup contained secret data"); }) as typeof fetch,
    5_061_000,
  );
  assert.deepEqual(network, {ok:false,code:"TEST_NETWORK_ERROR"});
});
