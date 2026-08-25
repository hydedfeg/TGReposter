import test from "node:test";
import assert from "node:assert/strict";
import { formatTelegramChatId } from "../server/services/telegramBotService";
import { resolveTelegramBotToken } from "../server/services/telegramCredentialService";
import { PromotionAdminError, PromotionAdminService } from "../server/services/promotionAdminService";
import type { TelegramBotAccountRecord, PromotionTargetRecord } from "../server/repositories/promotionRepository";

function botAccount(overrides: Partial<TelegramBotAccountRecord> = {}): TelegramBotAccountRecord {
  return {
    id: "bot-1",
    name: "Promotion Bot",
    credentialSource: "legacy_settings",
    credentialRef: "destination.botToken",
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function target(overrides: Partial<PromotionTargetRecord> = {}): PromotionTargetRecord {
  return {
    id: "target-1",
    botAccountId: "bot-1",
    name: "Partner Channel",
    chatId: "@partner",
    chatType: "channel",
    enabled: true,
    connectionStatus: "ok",
    lastCheckedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

test("promotion chat IDs preserve numeric and @ identifiers while normalizing usernames", () => {
  assert.equal(formatTelegramChatId(" partner_channel "), "@partner_channel");
  assert.equal(formatTelegramChatId("@partner_channel"), "@partner_channel");
  assert.equal(formatTelegramChatId("-100123456789"), "-100123456789");
  assert.equal(formatTelegramChatId("123456"), "123456");
});

test("legacy promotion bot credentials resolve without exposing them in database records", async () => {
  const token = await resolveTelegramBotToken(
    botAccount(),
    async () => ({ destination: { botToken: "LEGACY_SECRET" } })
  );
  assert.equal(token, "LEGACY_SECRET");
});

test("environment promotion bot credentials resolve by reference name", async () => {
  process.env.PROMOTION_TEST_BOT_TOKEN = "ENV_SECRET";
  try {
    const token = await resolveTelegramBotToken(
      botAccount({ credentialSource: "environment", credentialRef: "PROMOTION_TEST_BOT_TOKEN" }),
      async () => ({})
    );
    assert.equal(token, "ENV_SECRET");
  } finally {
    delete process.env.PROMOTION_TEST_BOT_TOKEN;
  }
});

test("vault references fail closed until a vault resolver exists", async () => {
  await assert.rejects(
    resolveTelegramBotToken(
      botAccount({ credentialSource: "vault", credentialRef: "telegram-bot-secret" }),
      async () => ({})
    ),
    /Vault credential resolution is not enabled/
  );
});

test("promotion bot account validation rejects malformed environment references", async () => {
  const service = new PromotionAdminService(async () => ({}), {} as any);
  await assert.rejects(
    service.createBotAccount({
      name: "Bad Env",
      credentialSource: "environment",
      credentialRef: "not-valid-env-name",
    }),
    (error: any) => {
      assert.ok(error instanceof PromotionAdminError);
      assert.equal(error.status, 400);
      return true;
    }
  );
});

test("changing a promotion target connection resets verification state", async () => {
  let capturedUpdate: any = null;
  const fakeRepository = {
    getTarget: async () => target(),
    getBotAccount: async () => botAccount(),
    updateTarget: async (_id: string, update: any) => {
      capturedUpdate = update;
      return target({
        chatId: update.chatId ?? "@partner",
        connectionStatus: update.connectionStatus ?? "ok",
        lastCheckedAt: update.lastCheckedAt ?? undefined,
        errorMessage: update.errorMessage ?? undefined,
      });
    },
  } as any;

  const service = new PromotionAdminService(async () => ({}), fakeRepository);
  const updated = await service.updateTarget("target-1", { chatId: "@new_partner" });

  assert.equal(capturedUpdate.connectionStatus, "unknown");
  assert.equal(capturedUpdate.lastCheckedAt, null);
  assert.equal(capturedUpdate.errorMessage, null);
  assert.equal(updated?.chatId, "@new_partner");
});
