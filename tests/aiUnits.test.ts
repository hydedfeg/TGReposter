import test from "node:test";
import assert from "node:assert/strict";
import {
  costUsdToAiUnits,
  normalizeCostUsd,
  parseAiUnits,
  parseSignedAiUnits,
  displayAiUnits,
  extractOpenRouterUsage,
  estimateMaxAiUnits
} from "../server/billing/aiUnits";

test("OpenRouter cost uses exact decimal AI units (100 per USD)", () => {
  assert.equal(costUsdToAiUnits("1"), "100.000000");
  assert.equal(costUsdToAiUnits("0.0155"), "1.550000");
  assert.equal(costUsdToAiUnits(2e-7), "0.000020");
  assert.equal(costUsdToAiUnits("0.00000000001"), "0.000001");
  assert.equal(normalizeCostUsd("0.00000000001"), "0.0000000001");
  assert.equal(parseAiUnits("100.125000"), 100125000n);
  assert.equal(parseSignedAiUnits("-2.250000"), -2250000n);
  assert.equal(displayAiUnits(-2250000n), "-2.250000");
  assert.throws(() => costUsdToAiUnits("-0.01"), /Invalid/);
  assert.throws(() => parseAiUnits("-0.1"), /Invalid/);
});

test("OpenRouter billed cost is taken from usage.cost, not upstream cost", () => {
  assert.deepEqual(extractOpenRouterUsage({
    usage: {
      prompt_tokens: 10,
      completion_tokens: 50,
      cost: 0.00625,
      cost_details: { upstream_inference_cost: 1.0 }
    }
  }), {
    promptTokens: 10,
    completionTokens: 50,
    costUsd: "0.0062500000",
    aiUnits: "0.625000"
  });
  assert.throws(() => extractOpenRouterUsage({ usage: { prompt_tokens: 2 } }),
    /missing billable usage.cost/);
  assert.throws(() => extractOpenRouterUsage({ usage: { cost: "-1" } }),
    /Invalid/);
});

test("preauthorization reserves bounded model exposure before provider call", () => {
  assert.equal(estimateMaxAiUnits({
    prompt: "0.000001",
    completion: "0.000002",
    request: "0"
  }, 1000, 1000, 2), "0.600000");
  assert.throws(() => estimateMaxAiUnits({ prompt:"0",completion:"0",request:"0" },1,200,0),
    /Invalid preauthorization/);
  assert.equal(estimateMaxAiUnits({ prompt:"0",completion:"0",request:"0" }, 1, 200), "0.000001");
});
