import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import i18next from "i18next";
import { APP_LOCALES } from "../src/i18n/locales";
import { i18nResources } from "../src/i18n/resources";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluralSuffix = /_(zero|one|two|few|many|other)$/;

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix.replace(pluralSuffix, "")] : [];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

test("all locales expose the same promotion translation keys", () => {
  const expected = new Set(flattenKeys(i18nResources.en.promotion));

  for (const locale of APP_LOCALES) {
    const actual = new Set(flattenKeys(i18nResources[locale].promotion));
    assert.deepEqual(actual, expected, `promotion keys differ for ${locale}`);
  }
});

test("promotion workspace labels resolve in every supported locale", async () => {
  const i18n = i18next.createInstance();

  await i18n.init({
    resources: i18nResources,
    fallbackLng: "en",
    supportedLngs: [...APP_LOCALES],
    defaultNS: "promotion",
    ns: ["promotion"],
    interpolation: { escapeValue: false },
  });

  const expected = {
    en: "Promotion Center",
    ru: "Центр продвижения",
    ar: "مركز الترويج",
    fa: "مرکز تبلیغات",
  } as const;

  for (const locale of APP_LOCALES) {
    await i18n.changeLanguage(locale);
    assert.equal(i18n.t("workspace.heroEyebrow"), expected[locale]);
  }
});

test("campaign, delivery, target, and content-mode machine values stay stable", () => {
  const workspace = readFileSync(resolve(root, "src/components/PromotionWorkspace.tsx"), "utf8");
  const types = readFileSync(resolve(root, "src/types.ts"), "utf8");

  assert.match(types, /PromotionCampaignStatus =[\s\S]*?'draft'[\s\S]*?'ready'[\s\S]*?'running'[\s\S]*?'completed'[\s\S]*?'partial'[\s\S]*?'failed'[\s\S]*?'cancelled'/);
  assert.match(types, /PromotionContentMode =[\s\S]*?'original'[\s\S]*?'teaser'[\s\S]*?'ai'[\s\S]*?'custom'/);
  assert.match(types, /PromotionDeliveryStatus =[\s\S]*?'pending'[\s\S]*?'in_progress'[\s\S]*?'success'[\s\S]*?'failed'[\s\S]*?'skipped'/);
  assert.match(types, /PromotionTargetChatType =[\s\S]*?'channel'[\s\S]*?'group'[\s\S]*?'supergroup'/);
  assert.match(workspace, /connectionStatus === "ok"/);
  assert.match(workspace, /status === "draft"/);
  assert.match(workspace, /status === "ready"/);
});

test("promotion AI action and style values remain independent from translated labels", () => {
  const studio = readFileSync(resolve(root, "src/components/PromotionAIStudio.tsx"), "utf8");

  for (const action of ["teaser", "rewrite", "shorten", "expand", "translate", "cta", "hashtags"]) {
    assert.match(studio, new RegExp(`value: "${action}"`));
  }
  for (const style of ["professional", "news", "educational", "friendly", "casual", "marketing", "viral"]) {
    assert.match(studio, new RegExp(`"${style}"`));
  }

  assert.match(studio, /useState<PromotionAIAction>\("rewrite"\)/);
  assert.match(studio, /useState<PromotionAIStyle>\("professional"\)/);
  assert.match(studio, /useState<AIOutputLanguageId>\("en"\)/);
  assert.match(studio, /AI_OUTPUT_LANGUAGE_IDS\.map/);
  assert.match(studio, /common:aiLanguages\.\$\{languageId\}/);
  assert.match(studio, /body: JSON\.stringify\(\{[\s\S]*?action,[\s\S]*?style,[\s\S]*?outputLanguage/);
});

test("promotion dates and counts use the selected interface locale", () => {
  const workspace = readFileSync(resolve(root, "src/components/PromotionWorkspace.tsx"), "utf8");

  assert.match(workspace, /normalizeAppLocale\(i18n\.language\)/);
  assert.match(workspace, /new Intl\.NumberFormat\(locale\)/);
  assert.match(workspace, /new Intl\.DateTimeFormat\(`\$\{locale\}-u-ca-gregory`/);
  assert.equal(workspace.includes("formattedCount: numberFormatter.format(selectedTargetIds.length)"), true);
  assert.equal(workspace.includes("formattedCount: numberFormatter.format(detail.posts.length)"), true);
});

test("promotion technical IDs stay LTR while human and generated copy is direction-aware", () => {
  const workspace = readFileSync(resolve(root, "src/components/PromotionWorkspace.tsx"), "utf8");
  const studio = readFileSync(resolve(root, "src/components/PromotionAIStudio.tsx"), "utf8");

  assert.match(workspace, /value=\{targetChatId\}[\s\S]*?dir="ltr"/);
  assert.match(workspace, /value=\{editSourceLink\} dir="ltr"/);
  assert.match(workspace, /delivery\.warningMessage[\s\S]*?dir="auto"/);
  assert.match(workspace, /delivery\.errorMessage[\s\S]*?dir="auto"/);
  assert.match(studio, /value=\{generatedResult\} dir="auto"/);
  assert.match(studio, /value=\{draftText\} dir="auto"/);
  assert.match(studio, /dir="ltr">\{providerInfo\}<\/span>/);
});

test("promotion RTL layout uses logical directional utilities", () => {
  const workspace = readFileSync(resolve(root, "src/components/PromotionWorkspace.tsx"), "utf8");
  const studio = readFileSync(resolve(root, "src/components/PromotionAIStudio.tsx"), "utf8");

  for (const source of [workspace, studio]) {
    assert.doesNotMatch(source, /\btext-left\b/);
    assert.doesNotMatch(source, /\b(?:left|right|pl|pr|ml|mr)-/);
  }

  assert.match(workspace, /\bstart-3\b/);
  assert.match(workspace, /\bps-9\b/);
  assert.match(workspace, /rtl-mirror/);
  assert.match(studio, /\bend-20\b/);
});

test("promotion frontend never introduces Telegram bot tokens or secret provider keys", () => {
  const files = [
    "src/components/PromotionCenter.tsx",
    "src/components/PromotionWorkspace.tsx",
    "src/components/PromotionAIStudio.tsx",
  ].map(file => readFileSync(resolve(root, file), "utf8")).join("\n");

  for (const forbidden of ["GEMINI_API_KEY", "OPENROUTER_API_KEY", "botToken", "credentialRef"]) {
    assert.equal(files.includes(forbidden), false);
  }
});
