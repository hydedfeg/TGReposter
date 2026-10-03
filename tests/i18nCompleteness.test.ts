import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { AI_OUTPUT_LANGUAGE_IDS, AI_OUTPUT_LANGUAGE_DEFINITIONS } from "../shared/aiLanguages";
import { APP_LOCALES, matchAppLocale } from "../src/i18n/locales";
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

test("every locale exposes the same namespaces and canonical translation keys as English", () => {
  const englishNamespaces = Object.keys(i18nResources.en).sort();

  for (const locale of APP_LOCALES) {
    assert.deepEqual(
      Object.keys(i18nResources[locale]).sort(),
      englishNamespaces,
      `namespace set differs for ${locale}`,
    );

    for (const namespace of englishNamespaces) {
      const english = new Set(
        flattenKeys(
          i18nResources.en[namespace as keyof typeof i18nResources.en],
        ),
      );
      const actual = new Set(
        flattenKeys(
          i18nResources[locale][namespace as keyof typeof i18nResources.en],
        ),
      );

      assert.deepEqual(
        actual,
        english,
        `translation keys differ for ${locale}.${namespace}`,
      );
    }
  }
});

test("locale matching distinguishes supported browser variants from unsupported languages", () => {
  assert.equal(matchAppLocale("fa-IR"), "fa");
  assert.equal(matchAppLocale("ar-SA"), "ar");
  assert.equal(matchAppLocale("ru-RU"), "ru");
  assert.equal(matchAppLocale("en-GB"), "en");
  assert.equal(matchAppLocale("fr-FR"), null);
  assert.equal(matchAppLocale(undefined), null);
});

test("initial locale precedence keeps local choice before supported browser language", () => {
  const source = readFileSync(resolve(root, "src/i18n/index.ts"), "utf8");

  const storedIndex = source.indexOf("window.localStorage.getItem(APP_LOCALE_STORAGE_KEY)");
  const browserIndex = source.indexOf("window.navigator.languages");
  const fallbackIndex = source.lastIndexOf("return DEFAULT_APP_LOCALE;");

  assert.ok(storedIndex >= 0);
  assert.ok(browserIndex > storedIndex);
  assert.ok(fallbackIndex > browserIndex);
  assert.match(source, /const locale = matchAppLocale\(language\)/);
});

test("Persian is a first-class AI output language with a stable internal ID", () => {
  assert.ok(AI_OUTPUT_LANGUAGE_IDS.includes("fa"));
  assert.equal(AI_OUTPUT_LANGUAGE_DEFINITIONS.fa.promptName, "Persian (Farsi)");

  for (const locale of APP_LOCALES) {
    const common = i18nResources[locale].common as {
      aiLanguages?: Record<string, unknown>;
    };
    assert.equal(typeof common.aiLanguages?.fa, "string");
  }

  const feed = readFileSync(resolve(root, "src/components/CurationFeed.tsx"), "utf8");
  assert.match(feed, /useState<AIOutputLanguageId>\("en"\)/);
  assert.match(feed, /AI_OUTPUT_LANGUAGE_IDS\.map/);
  assert.match(feed, /targetLanguage: activeLanguage/);
  assert.doesNotMatch(feed, /const languageOptions =/);
});

test("Telegram and AI-authored content stays direction-aware independently from UI direction", () => {
  const feed = readFileSync(resolve(root, "src/components/CurationFeed.tsx"), "utf8");
  const aiConfig = readFileSync(resolve(root, "src/components/AIConfig.tsx"), "utf8");
  const promotion = readFileSync(resolve(root, "src/components/PromotionAIStudio.tsx"), "utf8");

  assert.match(feed, /dir="auto">\{post\.originalText/);
  assert.match(feed, /value=\{draftText\}[\s\S]*?dir="auto"/);
  assert.match(feed, /dir="auto">\{suggestion\.result\}/);
  assert.match(aiConfig, /dir="auto">\{testResult\}<\/p>/);
  assert.match(promotion, /value=\{generatedResult\} dir="auto"/);
});

test("major frontend surfaces contain no physical inline-direction utilities", () => {
  const paths = [
    "src/App.tsx",
    "src/MarketingHome.tsx",
    "src/PromotionPage.tsx",
    "src/components/AIConfig.tsx",
    "src/components/AppShell.tsx",
    "src/components/CurationFeed.tsx",
    "src/components/Dashboard.tsx",
    "src/components/DatabaseConfig.tsx",
    "src/components/DestinationConfig.tsx",
    "src/components/FilterConfig.tsx",
    "src/components/Header.tsx",
    "src/components/LanguageSelector.tsx",
    "src/components/Login.tsx",
    "src/components/PromotionAIStudio.tsx",
    "src/components/PromotionCenter.tsx",
    "src/components/PromotionWorkspace.tsx",
    "src/components/SourceChannelsConfig.tsx",
    "src/components/UserManagement.tsx",
  ];

  for (const path of paths) {
    const source = readFileSync(resolve(root, path), "utf8");
    assert.doesNotMatch(
      source,
      /\b(?:left-|right-|pl-|pr-|ml-|mr-|text-left|text-right)\b/,
      `physical direction utility found in ${path}`,
    );
  }
});

test("App orchestration copy is translated instead of embedded as English UI text", () => {
  const source = readFileSync(resolve(root, "src/App.tsx"), "utf8");

  for (const forbidden of [
    "Checking your session",
    "Secure Telegram content operations",
    "Opening your workspace",
    "Publishing setup required",
    "Configure my destinations",
    "Filtering criteria updated successfully.",
    "Post dispatched successfully to your channel!",
  ]) {
    assert.equal(source.includes(forbidden), false, `hard-coded App copy: ${forbidden}`);
  }

  assert.match(source, /useTranslation\("common"\)/);
  assert.match(source, /runtime\.loading\.sessionTitle/);
  assert.match(source, /runtime\.publishingSetup\.action/);
  assert.match(source, /runtime\.channels\.allFetched/);
});

test("CurationFeed has no invalid outer-scope mode reference or duplicate direction attribute", () => {
  const source = readFileSync(resolve(root, "src/components/CurationFeed.tsx"), "utf8");
  const originalPanel = source.match(/function OriginalPostPanel[\s\S]*?^}/m)?.[0] ?? "";

  assert.doesNotMatch(originalPanel, /\bmode\b/);
  assert.equal((source.match(/aria-label=\{t\("accessibility\.curatedVersion"\)\}[\s\S]*?dir="auto"/g) ?? []).length, 1);
});
