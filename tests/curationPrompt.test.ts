import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCurationPrompt,
  CURATION_ACTIONS,
  isCurationAction
} from "../server/ai/curationPrompt";

test("curation action validation accepts only the four supported actions", () => {
  assert.deepEqual(CURATION_ACTIONS, ["rephrase", "summarize", "hashtags", "translate"]);

  for (const action of CURATION_ACTIONS) {
    assert.equal(isCurationAction(action), true);
  }

  for (const action of ["", "rewrite", "Rephrase", null, undefined, 1, {}]) {
    assert.equal(isCurationAction(action), false);
  }
});

test("rephrase prompt preserves custom and default tone behavior", () => {
  assert.equal(
    buildCurationPrompt("rephrase", "Original post", "friendly"),
    "You are an expert Telegram channel editor. Rephrase this post to sound friendly. Ensure the writing is concise, captures readers' interest instantly, preserves any external URL links, and is formatted nicely for reading. Respond with ONLY the finalized text, no conversational introductions or explanations.\n\nPost:\nOriginal post"
  );
  assert.equal(
    buildCurationPrompt("rephrase", "Original post"),
    "You are an expert Telegram channel editor. Rephrase this post to sound professional and engaging. Ensure the writing is concise, captures readers' interest instantly, preserves any external URL links, and is formatted nicely for reading. Respond with ONLY the finalized text, no conversational introductions or explanations.\n\nPost:\nOriginal post"
  );
  assert.equal(
    buildCurationPrompt("rephrase", "Original post", ""),
    buildCurationPrompt("rephrase", "Original post")
  );
});

test("summarize and hashtag prompts preserve their exact contracts", () => {
  assert.equal(
    buildCurationPrompt("summarize", "Original post"),
    "You are a professional news summarizer. Write a highly scannable, engaging 1-2 sentence summary of this post. Respond with ONLY the summary content, no intros, no quotes.\n\nPost:\nOriginal post"
  );
  assert.equal(
    buildCurationPrompt("hashtags", "Original post"),
    "Generate 3 to 6 highly relevant, catchy hashtags based on the content of this post. Output them on a single line, space-separated, with '#' characters. Do not include any other text.\n\nPost:\nOriginal post"
  );
});

test("translate prompt preserves custom and default language behavior", () => {
  assert.equal(
    buildCurationPrompt("translate", "Original post", "French"),
    "Translate the following Telegram post into French. Retain the original layout, bullet points, and any link URLs. Respond with ONLY the translated text, no meta-comments.\n\nPost:\nOriginal post"
  );
  assert.equal(
    buildCurationPrompt("translate", "Original post"),
    "Translate the following Telegram post into English. Retain the original layout, bullet points, and any link URLs. Respond with ONLY the translated text, no meta-comments.\n\nPost:\nOriginal post"
  );
  assert.equal(
    buildCurationPrompt("translate", "Original post", ""),
    buildCurationPrompt("translate", "Original post")
  );
});
