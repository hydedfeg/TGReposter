import test from "node:test";
import assert from "node:assert/strict";
import { PromotionAIError, PromotionAIService } from "../server/services/promotionAIService";

const baseCampaign = {
  id: "campaign-1",
  name: "Campaign",
  status: "draft" as const,
  createdAt: "2026-08-26T00:00:00.000Z",
  updatedAt: "2026-08-26T00:00:00.000Z",
};

const baseCampaignPost = {
  id: "campaign-post-1",
  campaignId: "campaign-1",
  postId: "source/1",
  contentMode: "ai" as const,
  promotionText: "Existing campaign draft",
  position: 0,
  createdAt: "2026-08-26T00:00:00.000Z",
  updatedAt: "2026-08-26T00:00:00.000Z",
};

const baseSourcePost = {
  id: "source/1",
  channelUsername: "source",
  originalText: "Original collected post",
  editedText: "Reviewed source text",
  telegramUrl: "https://t.me/source/1",
  status: "pending",
};

function repository(overrides: Record<string, any> = {}) {
  return {
    async getCampaign() { return baseCampaign; },
    async getCampaignPost() { return baseCampaignPost; },
    async getSourcePost() { return baseSourcePost; },
    ...overrides,
  };
}

test("promotion AI generation reuses configured provider/model and keeps output review-only", async () => {
  let captured: any = null;
  const service = new PromotionAIService(
    async () => ({ aiConfig: { provider: "openrouter", model: "test/model" } }),
    repository() as any,
    (async input => {
      captured = input;
      return { ok: true, result: "Generated promotion copy" } as const;
    }) as any
  );

  const result = await service.generate("campaign-1", "campaign-post-1", {
    action: "rewrite",
    style: "friendly",
    language: "English",
    currentText: "Current editor draft",
    instructions: "Keep the first sentence short",
  });

  assert.equal(result.result, "Generated promotion copy");
  assert.equal(result.provider, "openrouter");
  assert.equal(result.model, "test/model");
  assert.equal(result.action, "rewrite");
  assert.equal(result.style, "friendly");
  assert.equal(captured.provider, "openrouter");
  assert.equal(captured.model, "test/model");
  assert.match(captured.prompt, /Reviewed source text/);
  assert.match(captured.prompt, /Current editor draft/);
  assert.match(captured.prompt, /Keep the first sentence short/);
});

test("promotion AI generation is blocked once campaign delivery has started", async () => {
  let called = false;
  const service = new PromotionAIService(
    async () => ({ aiConfig: { provider: "gemini", model: "model" } }),
    repository({ async getCampaign() { return { ...baseCampaign, status: "running" }; } }) as any,
    (async () => {
      called = true;
      return { ok: true, result: "should not happen" } as const;
    }) as any
  );

  await assert.rejects(
    () => service.generate("campaign-1", "campaign-post-1", { action: "rewrite" }),
    (error: any) => {
      assert.equal(error instanceof PromotionAIError, true);
      assert.equal(error.status, 409);
      assert.equal(error.code, "CAMPAIGN_STATE_CONFLICT");
      return true;
    }
  );
  assert.equal(called, false);
});

test("promotion translation requires a target language before provider dispatch", async () => {
  let called = false;
  const service = new PromotionAIService(
    async () => ({ aiConfig: { provider: "gemini", model: "model" } }),
    repository() as any,
    (async () => {
      called = true;
      return { ok: true, result: "translated" } as const;
    }) as any
  );

  await assert.rejects(
    () => service.generate("campaign-1", "campaign-post-1", { action: "translate", language: "" }),
    (error: any) => {
      assert.equal(error.status, 400);
      assert.equal(error.code, "VALIDATION_ERROR");
      assert.match(error.message, /language is required/i);
      return true;
    }
  );
  assert.equal(called, false);
});

test("promotion AI provider failures preserve dispatcher status and stay server-side", async () => {
  const service = new PromotionAIService(
    async () => ({ aiConfig: { provider: "openrouter", model: "provider/model" } }),
    repository() as any,
    (async () => ({ ok: false, status: 504, error: "OpenRouter request timed out after 30000 ms." })) as any
  );

  await assert.rejects(
    () => service.generate("campaign-1", "campaign-post-1", { action: "teaser" }),
    (error: any) => {
      assert.equal(error.status, 504);
      assert.equal(error.code, "AI_PROVIDER_ERROR");
      assert.deepEqual(error.details, { provider: "openrouter", model: "provider/model" });
      return true;
    }
  );
});
