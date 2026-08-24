import test from "node:test";
import assert from "node:assert/strict";
import {
  dispatchCuration,
  type CurationDispatchRequest
} from "../server/ai/curationDispatcher";
import type { GeminiClient } from "../server/ai/providers/geminiProvider";

const baseRequest: CurationDispatchRequest = {
  provider: "gemini",
  model: "test-model",
  prompt: "Test prompt",
  geminiClient: null
};

test("dispatcher preserves missing provider-key errors", async () => {
  assert.deepEqual(await dispatchCuration(baseRequest), {
    ok: false,
    status: 400,
    error: "Gemini API Key is missing. Please add GEMINI_API_KEY in the Secrets panel."
  });

  assert.deepEqual(
    await dispatchCuration({ ...baseRequest, provider: "openrouter" }),
    {
      ok: false,
      status: 400,
      error: "OpenRouter API Key is missing. Please add OPENROUTER_API_KEY in the Secrets panel."
    }
  );
});

test("dispatcher generates Gemini content through the Gemini adapter", async () => {
  const calls: Array<{ model: string; contents: string }> = [];
  const geminiClient: GeminiClient = {
    models: {
      async generateContent(request) {
        calls.push(request);
        return { text: "  Gemini result  " };
      }
    }
  };

  const result = await dispatchCuration({
    ...baseRequest,
    geminiApiKey: "TEST_GEMINI_KEY",
    geminiClient
  });

  assert.deepEqual(result, { ok: true, result: "Gemini result" });
  assert.deepEqual(calls, [{ model: "test-model", contents: "Test prompt" }]);
});

test("dispatcher rejects empty Gemini output with a provider-neutral error", async () => {
  const geminiClient: GeminiClient = {
    models: {
      async generateContent() {
        return { text: "   " };
      }
    }
  };

  const result = await dispatchCuration({
    ...baseRequest,
    geminiApiKey: "TEST_GEMINI_KEY",
    geminiClient
  });

  assert.deepEqual(result, {
    ok: false,
    status: 502,
    error: "AI provider returned an empty or invalid response. Please try again."
  });
});

test("dispatcher preserves Gemini provider failures", async t => {
  const errorLog = t.mock.method(console, "error", () => {});
  const geminiClient: GeminiClient = {
    models: {
      async generateContent() {
        throw new Error("Mock Gemini failure");
      }
    }
  };

  const result = await dispatchCuration({
    ...baseRequest,
    geminiApiKey: "TEST_GEMINI_KEY",
    geminiClient
  });

  assert.deepEqual(result, { ok: false, status: 500, error: "Mock Gemini failure" });
  assert.equal(errorLog.mock.callCount(), 1);
});

test("dispatcher returns a deterministic timeout for stalled Gemini requests", async t => {
  const errorLog = t.mock.method(console, "error", () => {});
  const geminiClient: GeminiClient = {
    models: {
      generateContent() {
        return new Promise<never>(() => {});
      }
    }
  };

  const result = await dispatchCuration({
    ...baseRequest,
    geminiApiKey: "TEST_GEMINI_KEY",
    geminiClient,
    timeoutMs: 10
  });

  assert.deepEqual(result, {
    ok: false,
    status: 504,
    error: "Gemini request timed out after 10 ms."
  });
  assert.equal(errorLog.mock.callCount(), 1);
});

test("dispatcher generates OpenRouter content through the OpenRouter adapter", async t => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () =>
    new Response(
      JSON.stringify({ choices: [{ message: { content: "  OpenRouter result  " } }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  );

  const result = await dispatchCuration({
    ...baseRequest,
    provider: "openrouter",
    openRouterApiKey: "TEST_OPENROUTER_KEY"
  });

  assert.deepEqual(result, { ok: true, result: "OpenRouter result" });
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("dispatcher rejects malformed OpenRouter output with a provider-neutral error", async t => {
  t.mock.method(globalThis, "fetch", async () =>
    new Response(
      JSON.stringify({ choices: [{ message: { content: { invalid: true } } }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  );

  const result = await dispatchCuration({
    ...baseRequest,
    provider: "openrouter",
    openRouterApiKey: "TEST_OPENROUTER_KEY"
  });

  assert.deepEqual(result, {
    ok: false,
    status: 502,
    error: "AI provider returned an empty or invalid response. Please try again."
  });
});

test("dispatcher preserves OpenRouter upstream HTTP errors", async t => {
  t.mock.method(console, "error", () => {});
  t.mock.method(globalThis, "fetch", async () =>
    new Response(JSON.stringify({ error: { message: "Mock rate limit" } }), {
      status: 429,
      headers: { "content-type": "application/json" }
    })
  );

  const result = await dispatchCuration({
    ...baseRequest,
    provider: "openrouter",
    openRouterApiKey: "TEST_OPENROUTER_KEY"
  });

  assert.deepEqual(result, { ok: false, status: 500, error: "Mock rate limit (429)" });
});

test("dispatcher preserves the OpenRouter connection-error fallback", async t => {
  const errorLog = t.mock.method(console, "error", () => {});
  t.mock.method(globalThis, "fetch", async () => {
    throw {};
  });

  const result = await dispatchCuration({
    ...baseRequest,
    provider: "openrouter",
    openRouterApiKey: "TEST_OPENROUTER_KEY"
  });

  assert.deepEqual(result, {
    ok: false,
    status: 500,
    error: "OpenRouter connection failed"
  });
  assert.equal(errorLog.mock.callCount(), 1);
});

test("dispatcher aborts stalled OpenRouter requests and returns a timeout", async t => {
  const errorLog = t.mock.method(console, "error", () => {});
  let requestSignal: AbortSignal | null = null;
  t.mock.method(globalThis, "fetch", (_input, init) => {
    requestSignal = init?.signal || null;
    return new Promise<Response>(() => {});
  });

  const result = await dispatchCuration({
    ...baseRequest,
    provider: "openrouter",
    openRouterApiKey: "TEST_OPENROUTER_KEY",
    timeoutMs: 10
  });

  assert.deepEqual(result, {
    ok: false,
    status: 504,
    error: "OpenRouter request timed out after 10 ms."
  });
  assert.equal(requestSignal?.aborted, true);
  assert.equal(errorLog.mock.callCount(), 1);
});

test("dispatcher preserves unsupported-provider errors", async () => {
  const result = await dispatchCuration({
    ...baseRequest,
    provider: "unsupported"
  });

  assert.deepEqual(result, {
    ok: false,
    status: 400,
    error: "Unsupported AI Provider: unsupported"
  });
});
