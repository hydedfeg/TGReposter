import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_OUTPUT_LANGUAGE_DEFINITIONS,
  AI_OUTPUT_LANGUAGE_IDS,
  getAIOutputLanguagePromptName,
  isAIOutputLanguageId,
  resolveAIOutputLanguageId,
} from "../shared/aiLanguages";
import { APP_LOCALES } from "../src/i18n/locales";
import { i18nResources } from "../src/i18n/resources";

test("AI output languages use stable machine IDs", () => {
  assert.deepEqual(
    AI_OUTPUT_LANGUAGE_IDS,
    ["en", "es", "ru", "fr", "de", "zh", "ar", "fa"],
  );

  for (const id of AI_OUTPUT_LANGUAGE_IDS) {
    assert.equal(isAIOutputLanguageId(id), true);
    assert.equal(typeof AI_OUTPUT_LANGUAGE_DEFINITIONS[id].promptName, "string");
  }

  assert.equal(isAIOutputLanguageId("Persian"), false);
  assert.equal(isAIOutputLanguageId("xx"), false);
});

test("AI output language aliases resolve only at the API compatibility boundary", () => {
  assert.equal(resolveAIOutputLanguageId("fa"), "fa");
  assert.equal(resolveAIOutputLanguageId("Persian"), "fa");
  assert.equal(resolveAIOutputLanguageId("Farsi"), "fa");
  assert.equal(resolveAIOutputLanguageId("Persian (Farsi)"), "fa");
  assert.equal(resolveAIOutputLanguageId("French"), "fr");
  assert.equal(resolveAIOutputLanguageId("Klingon"), null);

  assert.equal(getAIOutputLanguagePromptName("fa"), "Persian (Farsi)");
  assert.equal(getAIOutputLanguagePromptName("ar"), "Arabic");
});

test("every interface locale labels every supported AI output language", () => {
  for (const locale of APP_LOCALES) {
    const common = i18nResources[locale].common as {
      aiLanguages?: Record<string, string>;
    };

    assert.ok(common.aiLanguages, `missing AI language labels for ${locale}`);
    for (const id of AI_OUTPUT_LANGUAGE_IDS) {
      assert.equal(
        typeof common.aiLanguages[id],
        "string",
        `missing ${id} AI language label for ${locale}`,
      );
      assert.ok(common.aiLanguages[id].trim());
    }
  }
});
