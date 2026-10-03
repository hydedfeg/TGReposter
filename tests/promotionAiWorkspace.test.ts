import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("Promotion Center exposes the AI Promotion Studio without replacing campaign delivery UI", () => {
  const center = read("src/components/PromotionCenter.tsx");
  const page = read("src/PromotionPage.tsx");
  const englishPromotion = read("src/i18n/locales/en/promotion.ts");

  assert.match(center, /t\("center\.aiStudio"\)/);
  assert.match(englishPromotion, /aiStudio: "AI Promotion Studio"/);
  assert.match(center, /PromotionWorkspace/);
  assert.match(center, /PromotionAIStudio/);
  assert.match(page, /PromotionCenter/);
});

test("AI Studio uses campaign-scoped generation and explicit review/apply/save flow", () => {
  const studio = read("src/components/PromotionAIStudio.tsx");
  const router = read("server/routes/promotion.ts");
  const englishPromotion = read("src/i18n/locales/en/promotion.ts");

  assert.match(studio, /\/api\/promotion\/campaigns\/\$\{detail\.campaign\.id\}\/posts\/\$\{selectedPost\.id\}\/ai/);
  assert.match(studio, /t\("ai\.apply"\)/);
  assert.match(studio, /t\("ai\.save"\)/);
  assert.match(studio, /labelKey: "ai\.actions\.cta\.label"/);
  assert.match(studio, /labelKey: "ai\.actions\.hashtags\.label"/);
  assert.match(englishPromotion, /apply: "Apply result to editor"/);
  assert.match(englishPromotion, /save: "Save to campaign"/);
  assert.match(router, /campaigns\/:id\/posts\/:campaignPostId\/ai/);
});

test("Promotion AI frontend does not handle provider keys or Telegram credentials", () => {
  const studio = read("src/components/PromotionAIStudio.tsx");
  const center = read("src/components/PromotionCenter.tsx");

  for (const forbidden of ["GEMINI_API_KEY", "OPENROUTER_API_KEY", "botToken", "credentialRef"]) {
    assert.equal(studio.includes(forbidden), false);
    assert.equal(center.includes(forbidden), false);
  }
  assert.match(studio, /t\("ai\.backendNote"\)/);
  assert.match(read("src/i18n/locales/en/promotion.ts"), /Provider and API keys are resolved on the backend/);
});
