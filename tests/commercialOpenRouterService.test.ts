import test from "node:test";
import assert from "node:assert/strict";
import {
  commercialOpenRouterCuration,
  CommercialAIError
} from "../server/billing/commercialOpenRouterService";
import { AiUnitsError } from "../server/billing/aiBalanceService";
import type { OpenRouterTextModel } from "../server/ai/openRouterModelCatalog";

const model: OpenRouterTextModel = {
  id: "provider/model",
  name: "Test Model",
  provider: "provider",
  contextLength: 128000,
  maxCompletionTokens: 4096,
  pricing: { prompt: "0.000001", completion: "0.000002", request: "0" }
};

const input = {
  ownerPrincipal: "legacy:alice",
  requestKey: "test-idempotency-key",
  operation: "rewrite",
  modelId: "provider/model",
  prompt: "Rewrite this post",
  periodStart: "2026-10-01T00:00:00Z",
  periodEnd: "2026-11-01T00:00:00Z"
};

test("commercial OpenRouter path reserves before provider call and settles actual usage", async () => {
  const order: string[] = [];
  const result = await commercialOpenRouterCuration(input, {
    apiKey: "SERVER_OWNED_TEST_KEY",
    getModel: async () => model,
    reserve: async (request) => {
      order.push("reserve");
      assert.equal(request.ownerPrincipal, "legacy:alice");
      assert.ok(Number(request.maximumUnits) > 0);
      return { requestId: "req-id", reservedUnits: "20.000000",
        includedUnits: "20.000000", purchasedUnits: "0.000000" };
    },
    callProvider: async (request) => {
      order.push("provider");
      assert.equal(request.maxTokens, 2048);
      assert.equal(request.includeUsage, true);
      return { ok: true, result: "Edited content", modelId: model.id,
        generationId: "gen-001", usage: {
          costUsd: "0.0125000000", aiUnits: "1.250000",
          promptTokens: 20, completionTokens: 90
        }
      };
    },
    settle: async (record) => {
      order.push("settle");
      assert.equal(record.actualCostUsd, "0.0125000000");
      assert.equal(record.generationId, "gen-001");
      return { requestId: "req-id", chargedUnits: "1.250000", settled: true };
    },
    reconcile: async () => { throw new Error("must not reconcile success"); }
  });
  assert.deepEqual(order, ["reserve", "provider", "settle"]);
  assert.deepEqual(result, {
    text: "Edited content", modelId: model.id,
    generationId: "gen-001", chargedUnits: "1.250000"
  });
});

test("insufficient credits block upstream calls", async () => {
  let providerCalled = false;
  await assert.rejects(
    commercialOpenRouterCuration(input, {
      apiKey: "TEST",
      getModel: async () => model,
      reserve: async () => {
        throw new AiUnitsError(402, "AI_BALANCE_EXHAUSTED", "Not enough AI Units.");
      },
      callProvider: async () => {
        providerCalled = true;
        return { ok: true, result: "Never" };
      }
    }),
    (error: unknown) => error instanceof CommercialAIError
      && error.status === 402 && error.code === "AI_BALANCE_EXHAUSTED"
  );
  assert.equal(providerCalled, false);
});

test("unverified provider cost retains the reservation and records generation ID", async () => {
  const reconciliations: string[] = [];
  await assert.rejects(
    commercialOpenRouterCuration(input, {
      apiKey: "TEST",
      getModel: async () => model,
      reserve: async () => ({
        requestId: "req-id", reservedUnits: "20.000000",
        includedUnits: "20.000000", purchasedUnits: "0.000000"
      }),
      callProvider: async () => ({
        ok: true, result: "Something", generationId: "gen-needs-review", usage: null
      }),
      reconcile: async (_owner, _key, _reason, generation) => {
        reconciliations.push(String(generation));
      }
    }),
    /Provider usage is not yet verified/
  );
  assert.deepEqual(reconciliations, ["gen-needs-review"]);
});

test("unknown model is refused before reserve", async () => {
  await assert.rejects(
    commercialOpenRouterCuration(input, {
      apiKey: "TEST",
      getModel: async () => null,
      reserve: async () => { throw new Error("must not reserve"); }
    }),
    /Model is not available/
  );
});
