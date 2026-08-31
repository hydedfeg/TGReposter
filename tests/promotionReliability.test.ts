import test from "node:test";
import assert from "node:assert/strict";
import { mapWithConcurrency } from "../server/services/telegramPublisherService";
import {
  MAX_PROMOTION_DELIVERY_ATTEMPTS,
  PromotionCampaignError,
  PromotionCampaignService,
} from "../server/services/promotionCampaignService";

test("Telegram publisher bounds target concurrency while preserving result order", async () => {
  let active = 0;
  let maxActive = 0;
  const values = [1, 2, 3, 4, 5, 6];

  const results = await mapWithConcurrency(values, 2, async value => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise(resolve => setTimeout(resolve, 8));
    active -= 1;
    return value * 10;
  });

  assert.deepEqual(results, [10, 20, 30, 40, 50, 60]);
  assert.ok(maxActive <= 2);
  assert.ok(maxActive > 1);
});

test("promotion retries stop at the configured delivery attempt ceiling", async () => {
  const campaignId = "11111111-1111-4111-8111-111111111111";
  const deliveryId = "22222222-2222-4222-8222-222222222222";
  let acquiredRunningState = false;

  const fakeRepository = {
    getCampaign: async () => ({
      id: campaignId,
      name: "Reliability campaign",
      status: "partial",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    listDeliveryWorkItems: async () => [{
      delivery: {
        id: deliveryId,
        attemptCount: MAX_PROMOTION_DELIVERY_ATTEMPTS,
        status: "failed",
      },
      target: { id: "33333333-3333-4333-8333-333333333333" },
    }],
    markCampaignRunningForRetry: async () => {
      acquiredRunningState = true;
      return null;
    },
  } as any;

  const service = new PromotionCampaignService(async () => ({}), fakeRepository);

  await assert.rejects(
    service.retryFailedDeliveries(campaignId, {}),
    (error: any) => {
      assert.ok(error instanceof PromotionCampaignError);
      assert.equal(error.code, "DELIVERY_RETRY_LIMIT_REACHED");
      return true;
    }
  );
  assert.equal(acquiredRunningState, false);
});
