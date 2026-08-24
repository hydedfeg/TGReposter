import test from "node:test";
import assert from "node:assert/strict";
import {
  requestGeminiCuration,
  type GeminiClient
} from "../server/ai/providers/geminiProvider";

test("Gemini adapter preserves model and prompt forwarding plus result trimming", async () => {
  const calls: Array<{ model: string; contents: string }> = [];
  const client: GeminiClient = {
    models: {
      async generateContent(request) {
        calls.push(request);
        return { text: "  Mock curated result  " };
      }
    }
  };

  const result = await requestGeminiCuration({
    client,
    model: "gemini-test-model",
    prompt: "Test prompt"
  });

  assert.equal(result, "Mock curated result");
  assert.deepEqual(calls, [{ model: "gemini-test-model", contents: "Test prompt" }]);
});

test("Gemini adapter preserves an empty result when response text is absent", async () => {
  const client: GeminiClient = {
    models: {
      async generateContent() {
        return {};
      }
    }
  };

  const result = await requestGeminiCuration({
    client,
    model: "gemini-test-model",
    prompt: "Test prompt"
  });

  assert.equal(result, "");
});

test("Gemini adapter safely normalizes malformed response text", async () => {
  const client: GeminiClient = {
    models: {
      async generateContent() {
        return { text: { invalid: true } };
      }
    }
  };

  const result = await requestGeminiCuration({
    client,
    model: "gemini-test-model",
    prompt: "Test prompt"
  });

  assert.equal(result, "");
});

test("Gemini adapter leaves provider failures for the route to handle", async () => {
  const client: GeminiClient = {
    models: {
      async generateContent() {
        throw new Error("Mock Gemini failure");
      }
    }
  };

  await assert.rejects(
    requestGeminiCuration({
      client,
      model: "gemini-test-model",
      prompt: "Test prompt"
    }),
    /Mock Gemini failure/
  );
});
