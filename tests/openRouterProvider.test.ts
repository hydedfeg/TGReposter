import test from "node:test";
import assert from "node:assert/strict";
import {
  OPENROUTER_CHAT_COMPLETIONS_URL,
  requestOpenRouterCuration
} from "../server/ai/providers/openRouterProvider";

test("OpenRouter adapter preserves the request and success response contract", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input, init });
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: "  Mock curated result  " } }]
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const result = await requestOpenRouterCuration({
    apiKey: "TEST_OPENROUTER_KEY",
    model: "openrouter/test-model",
    prompt: "Test prompt",
    fetchImpl
  });

  assert.deepEqual(result, { ok: true, result: "Mock curated result" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, OPENROUTER_CHAT_COMPLETIONS_URL);
  assert.equal(calls[0].init?.method, "POST");

  const headers = new Headers(calls[0].init?.headers);
  assert.equal(headers.get("authorization"), "Bearer TEST_OPENROUTER_KEY");
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.get("http-referer"), "https://ai.studio/build");
  assert.equal(headers.get("x-title"), "Telegram Curator");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    model: "openrouter/test-model",
    messages: [{ role: "user", content: "Test prompt" }]
  });
});

test("OpenRouter adapter preserves an empty result when completion content is absent", async () => {
  const result = await requestOpenRouterCuration({
    apiKey: "TEST_OPENROUTER_KEY",
    model: "openrouter/test-model",
    prompt: "Test prompt",
    fetchImpl: async () =>
      new Response(JSON.stringify({ choices: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
  });

  assert.deepEqual(result, { ok: true, result: "" });
});

test("OpenRouter adapter safely normalizes malformed completion content", async () => {
  const result = await requestOpenRouterCuration({
    apiKey: "TEST_OPENROUTER_KEY",
    model: "openrouter/test-model",
    prompt: "Test prompt",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: { invalid: true } } }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
  });

  assert.deepEqual(result, { ok: true, result: "" });
});

test("OpenRouter adapter preserves structured upstream errors", async t => {
  const errorLog = t.mock.method(console, "error", () => {});
  const result = await requestOpenRouterCuration({
    apiKey: "TEST_OPENROUTER_KEY",
    model: "openrouter/test-model",
    prompt: "Test prompt",
    fetchImpl: async () =>
      new Response(JSON.stringify({ error: { message: "Mock rate limit" } }), {
        status: 429,
        headers: { "content-type": "application/json" }
      })
  });

  assert.deepEqual(result, { ok: false, status: 429, error: "Mock rate limit" });
  assert.equal(errorLog.mock.callCount(), 1);
});

test("OpenRouter adapter preserves the fallback for malformed upstream errors", async t => {
  t.mock.method(console, "error", () => {});
  const result = await requestOpenRouterCuration({
    apiKey: "TEST_OPENROUTER_KEY",
    model: "openrouter/test-model",
    prompt: "Test prompt",
    fetchImpl: async () => new Response("not-json", { status: 502 })
  });

  assert.deepEqual(result, {
    ok: false,
    status: 502,
    error: "OpenRouter API call failed"
  });
});

test("OpenRouter adapter leaves connection failures for the route to handle", async () => {
  await assert.rejects(
    requestOpenRouterCuration({
      apiKey: "TEST_OPENROUTER_KEY",
      model: "openrouter/test-model",
      prompt: "Test prompt",
      fetchImpl: async () => {
        throw new Error("Mock connection failure");
      }
    }),
    /Mock connection failure/
  );
});
