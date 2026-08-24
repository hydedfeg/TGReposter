import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_CONNECTION_FALLBACK_ERROR,
  AI_CURATION_FALLBACK_ERROR
} from "../src/utils/aiErrors";

test("AI curation frontend fallbacks are provider-neutral", () => {
  assert.equal(
    AI_CURATION_FALLBACK_ERROR,
    "AI was unable to curate this post. Check your provider configuration and try again."
  );
  assert.equal(
    AI_CONNECTION_FALLBACK_ERROR,
    "Failed to contact the configured AI provider. Please try again."
  );

  for (const message of [AI_CURATION_FALLBACK_ERROR, AI_CONNECTION_FALLBACK_ERROR]) {
    assert.doesNotMatch(message, /gemini|openrouter/i);
  }
});
