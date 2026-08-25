import test from "node:test";
import assert from "node:assert/strict";
import {
  PromotionCampaignError,
  PromotionCampaignService,
  renderPromotionText,
} from "../server/services/promotionCampaignService";
import type {
  PromotionCampaignPostRecord,
  PromotionCampaignRecord,
  PromotionSourcePostRecord,
} from "../server/repositories/promotionCampaignRepository";

const now = new Date().toISOString();

function campaign(overrides: Partial<PromotionCampaignRecord> = {}): PromotionCampaignRecord {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Partner Promotion",
    status: "draft",
    createdByUsername: "admin",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function campaignPost(overrides: Partial<PromotionCampaignPostRecord> = {}): PromotionCampaignPostRecord {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    campaignId: "11111111-1111-4111-8111-111111111111",
    postId: "source/42",
    contentMode: "original",
    position: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function sourcePost(overrides: Partial<PromotionSourcePostRecord> = {}): PromotionSourcePostRecord {
  return {
    id: "source/42",
    channelUsername: "source",
    originalText: "Original channel post",
    telegramUrl: "https://t.me/source/42",
    status: "pending",
    ...overrides,
  };
}

test("original promotion content appends CTA and canonical source link", () => {
  const text = renderPromotionText(
    campaignPost({ ctaText: "Follow the full story" }),
    sourcePost()
  );
  assert.equal(
    text,
    "Original channel post\n\nFollow the full story\n\nhttps://t.me/source/42"
  );
});

test("promotion rendering does not duplicate a source link already present in copy", () => {
  const text = renderPromotionText(
    campaignPost({
      contentMode: "custom",
      promotionText: "Read this update: https://t.me/source/42",
    }),
    sourcePost()
  );
  assert.equal(text, "Read this update: https://t.me/source/42");
});

test("non-original promotion modes require prepared promotion text", () => {
  assert.throws(
    () => renderPromotionText(campaignPost({ contentMode: "ai" }), sourcePost()),
    (error: any) => {
      assert.ok(error instanceof PromotionCampaignError);
      assert.equal(error.code, "CONTENT_NOT_READY");
      return true;
    }
  );
});

test("campaign creation trims metadata and preserves creator identity", async () => {
  let captured: any = null;
  const fakeRepository = {
    createCampaign: async (input: any) => {
      captured = input;
      return campaign({ name: input.name, description: input.description, createdByUsername: input.createdByUsername });
    },
  } as any;
  const service = new PromotionCampaignService(async () => ({}), fakeRepository);
  await service.createCampaign({ name: "  Launch  ", description: "  Partner push  " }, "editor");
  assert.deepEqual(captured, {
    name: "Launch",
    description: "Partner push",
    createdByUsername: "editor",
  });
});

test("campaigns with delivery history cannot be manually edited", async () => {
  const fakeRepository = {
    getCampaign: async () => campaign({ status: "partial" }),
  } as any;
  const service = new PromotionCampaignService(async () => ({}), fakeRepository);
  await assert.rejects(
    service.updateCampaign(campaign().id, { name: "Changed" }),
    (error: any) => {
      assert.ok(error instanceof PromotionCampaignError);
      assert.equal(error.code, "CAMPAIGN_STATE_CONFLICT");
      return true;
    }
  );
});

test("campaign launch rejects an empty campaign before any target publishing work", async () => {
  const fakeRepository = {
    getCampaign: async () => campaign(),
    listCampaignPosts: async () => [],
  } as any;
  const service = new PromotionCampaignService(async () => ({}), fakeRepository);
  await assert.rejects(
    service.launchCampaign(campaign().id, {
      targetIds: ["33333333-3333-4333-8333-333333333333"],
    }),
    (error: any) => {
      assert.ok(error instanceof PromotionCampaignError);
      assert.equal(error.code, "EMPTY_CAMPAIGN");
      return true;
    }
  );
});

test("retry validates every requested delivery before acquiring running state", async () => {
  let markedRunning = false;
  const validDeliveryId = "44444444-4444-4444-8444-444444444444";
  const missingDeliveryId = "55555555-5555-4555-8555-555555555555";
  const fakeRepository = {
    getCampaign: async () => campaign({ status: "partial" }),
    listDeliveryWorkItems: async () => [{
      delivery: { id: validDeliveryId },
      target: { id: "66666666-6666-4666-8666-666666666666" },
    }],
    markCampaignRunningForRetry: async () => {
      markedRunning = true;
      return campaign({ status: "running" });
    },
  } as any;
  const service = new PromotionCampaignService(async () => ({}), fakeRepository);

  await assert.rejects(
    service.retryFailedDeliveries(campaign().id, {
      deliveryIds: [validDeliveryId, missingDeliveryId],
    }),
    (error: any) => {
      assert.ok(error instanceof PromotionCampaignError);
      assert.equal(error.code, "DELIVERIES_NOT_RETRYABLE");
      return true;
    }
  );
  assert.equal(markedRunning, false);
});

test("campaign post positions reject negative values before persistence", async () => {
  const fakeRepository = {
    getCampaign: async () => campaign(),
    getSourcePost: async () => sourcePost(),
  } as any;
  const service = new PromotionCampaignService(async () => ({}), fakeRepository);
  await assert.rejects(
    service.addCampaignPost(campaign().id, {
      postId: "source/42",
      contentMode: "custom",
      promotionText: "Promotion copy",
      position: -1,
    }),
    (error: any) => {
      assert.ok(error instanceof PromotionCampaignError);
      assert.equal(error.code, "VALIDATION_ERROR");
      return true;
    }
  );
});
