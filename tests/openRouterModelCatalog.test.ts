import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeOpenRouterModels,
  OpenRouterModelCatalog,
  OPENROUTER_MODELS_URL
} from "../server/ai/openRouterModelCatalog";

const model = (id: string, outputs: string[] = ["text"]) => ({
  id,
  name: id,
  architecture: { output_modalities: outputs },
  pricing: { prompt: "0.0000003", completion: "0.0000025", request: "0" },
  context_length: 128000,
  top_provider: { max_completion_tokens: 8192 }
});

test("model catalog validates text capability and avoids unknown prices", () => {
  const models = normalizeOpenRouterModels({ data: [
    model("provider/text-model"),
    model("provider/image-only", ["image"]),
    { ...model("provider/unpriced"), pricing: { prompt: null, completion: null } },
    model("provider/text-model")
  ] });
  assert.equal(models.length, 1);
  assert.deepEqual(models[0], {
    id: "provider/text-model",
    name: "provider/text-model",
    provider: "provider",
    contextLength: 128000,
    maxCompletionTokens: 8192,
    pricing: { prompt: "0.0000003", completion: "0.0000025", request: "0" }
  });
  assert.throws(() => normalizeOpenRouterModels({ invalid: true }), /Invalid OpenRouter/);
});

test("model catalog caches validated results and refreshes after TTL", async () => {
  let now = 0;
  let calls = 0;
  const catalog = new OpenRouterModelCatalog(async (url, init) => {
    assert.equal(url, OPENROUTER_MODELS_URL);
    assert.equal(init?.method, "GET");
    calls++;
    return new Response(JSON.stringify({ data: [model("provider/model-" + calls)] }), { status: 200 });
  }, () => now);

  const first = await catalog.listModels();
  assert.equal(first[0].id, "provider/model-1");
  assert.equal((await catalog.listModels())[0].id, "provider/model-1");
  assert.equal(calls, 1);
  now += 600_001;
  assert.equal((await catalog.listModels())[0].id, "provider/model-2");
  assert.equal(calls, 2);
});

test("catalog keeps a previously verified cache through upstream outage", async () => {
  let calls = 0;
  let now = 0;
  const catalog = new OpenRouterModelCatalog(async () => {
    calls++;
    if (calls > 1) return new Response("", { status: 503 });
    return new Response(JSON.stringify({ data: [model("provider/good")] }), { status: 200 });
  }, () => now);
  assert.equal((await catalog.listModels()).length, 1);
  now += 600_001;
  assert.equal((await catalog.listModels())[0].id, "provider/good");
});

test("model catalog handles concurrent refresh with one upstream request", async () => {
  let calls = 0;
  const catalog = new OpenRouterModelCatalog(async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return new Response(JSON.stringify({ data: [model("provider/good")] }), { status: 200 });
  });
  await Promise.all([catalog.listModels(), catalog.listModels(), catalog.listModels()]);
  assert.equal(calls, 1);
});
