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

test("all locales expose the same content inbox translation keys", () => {
  const expected = new Set(flattenKeys(i18nResources.en.inbox));

  for (const locale of APP_LOCALES) {
    const actual = new Set(flattenKeys(i18nResources[locale].inbox));
    assert.deepEqual(actual, expected, `inbox keys differ for ${locale}`);
  }
});

test("content inbox status labels resolve in every supported locale", async () => {
  const i18n = i18next.createInstance();

  await i18n.init({
    resources: i18nResources,
    fallbackLng: "en",
    supportedLngs: [...APP_LOCALES],
    defaultNS: "inbox",
    ns: ["inbox"],
    interpolation: { escapeValue: false },
  });

  const expected = {
    en: "Pending",
    ru: "Ожидают проверки",
    ar: "بانتظار المراجعة",
    fa: "در انتظار بررسی",
  } as const;

  for (const locale of APP_LOCALES) {
    await i18n.changeLanguage(locale);
    assert.equal(i18n.t("statuses.pending"), expected[locale]);
  }
});

test("UI translations stay separate from stable AI machine values", () => {
  const source = readFileSync(resolve(root, "src/components/CurationFeed.tsx"), "utf8");

  assert.match(source, /value: "Professional", labelKey: "ai\.tones\.professional"/);
  assert.match(source, /AI_OUTPUT_LANGUAGE_IDS/);
  assert.match(source, /useState<AIOutputLanguageId>\("en"\)/);
  assert.match(source, /common:aiLanguages\.\$\{languageId\}/);
  assert.match(source, /runAiAction\("rephrase", activeTone\)/);
  assert.match(source, /runAiAction\("translate"\)/);
  assert.match(source, /targetLanguage: activeLanguage/);
  assert.doesNotMatch(source, /value: "Persian"/);
});

test("content inbox localizes dates and counts while preserving content direction", () => {
  const source = readFileSync(resolve(root, "src/components/CurationFeed.tsx"), "utf8");

  assert.match(source, /new Intl\.DateTimeFormat\(\`\$\{locale\}-u-ca-gregory\`/);
  assert.match(source, /new Intl\.NumberFormat\(locale\)/);
  assert.match(source, /dir="auto"/);
  assert.match(source, /destinations\.selected/);
  assert.match(source, /formattedCount: numberFormatter\.format/);
});

test("content inbox uses logical RTL layout boundaries", () => {
  const source = readFileSync(resolve(root, "src/components/CurationFeed.tsx"), "utf8");

  assert.match(source, /border-e border-slate-200/);
  assert.match(source, /border-s border-slate-200/);
  assert.match(source, /rounded-ee-md/);
  assert.doesNotMatch(source, /\bborder-r\b/);
  assert.doesNotMatch(source, /\bborder-l\b/);
  assert.doesNotMatch(source, /\brounded-br-md\b/);
});

test("content inbox no longer depends on the removed hard-coded tab label map", () => {
  const source = readFileSync(resolve(root, "src/components/CurationFeed.tsx"), "utf8");

  assert.doesNotMatch(source, /tabLabels/);
  assert.match(source, /t\(\`statuses\.\$\{post\.status\}\`\)/);
});
