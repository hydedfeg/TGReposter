import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("Promotion Center exposes the AI Promotion Studio without replacing campaign delivery UI", () => {
  const center = read("src/components/PromotionCenter.tsx");
  const page = read("src/PromotionPage.tsx");

  assert.match(center, /AI Promotion Studio/);
  assert.match(center, /PromotionWorkspace/);
  assert.match(center, /PromotionAIStudio/);
  assert.match(page, /PromotionCenter/);
});

test("AI Studio uses campaign-scoped generation and explicit review/apply/save flow", () => {
  const studio = read("src/components/PromotionAIStudio.tsx");
  const router = read("server/routes/promotion.ts");

  assert.match(studio, /\/api\/promotion\/campaigns\/\$\{detail\.campaign\.id\}\/posts\/\$\{selectedPost\.id\}\/ai/);
  assert.match(studio, /Apply result to editor/);
  assert.match(studio, /Save to campaign/);
  assert.match(studio, /Generate CTA/);
  assert.match(studio, /Generate hashtags/);
  assert.match(router, /campaigns\/:id\/posts\/:campaignPostId\/ai/);
});

test("Promotion AI frontend does not handle provider keys or Telegram credentials", () => {
  const studio = read("src/components/PromotionAIStudio.tsx");
  const center = read("src/components/PromotionCenter.tsx");

  for (const forbidden of ["GEMINI_API_KEY", "OPENROUTER_API_KEY", "botToken", "credentialRef"]) {
    assert.equal(studio.includes(forbidden), false);
    assert.equal(center.includes(forbidden), false);
  }
  assert.match(studio, /Provider and API keys are resolved on the backend/);
});
