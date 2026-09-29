import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import i18next from "i18next";
import { APP_LOCALES } from "../src/i18n/locales";
import { i18nResources } from "../src/i18n/resources";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

test("all locales expose the same AI configuration translation keys", () => {
  const expected = new Set(flattenKeys(i18nResources.en.ai));

  for (const locale of APP_LOCALES) {
    const actual = new Set(flattenKeys(i18nResources[locale].ai));
    assert.deepEqual(actual, expected, `AI configuration keys differ for ${locale}`);
  }
});

test("AI configuration titles resolve in every supported locale", async () => {
  const i18n = i18next.createInstance();

  await i18n.init({
    resources: i18nResources,
    fallbackLng: "en",
    supportedLngs: [...APP_LOCALES],
    defaultNS: "ai",
    ns: ["ai"],
    interpolation: { escapeValue: false },
  });

  const expected = {
    en: "AI Curation Engine",
    ru: "Модуль ИИ-обработки",
    ar: "محرك تنسيق المحتوى بالذكاء الاصطناعي",
    fa: "موتور پردازش محتوا با هوش مصنوعی",
  } as const;

  for (const locale of APP_LOCALES) {
    await i18n.changeLanguage(locale);
    assert.equal(i18n.t("header.title"), expected[locale]);
  }
});

test("provider IDs, model IDs, and playground payload stay stable", () => {
  const source = readFileSync(resolve(root, "src/components/AIConfig.tsx"), "utf8");

  assert.match(source, /id: "gemini" as const/);
  assert.match(source, /id: "openrouter" as const/);
  assert.match(source, /"gemini-3\.5-flash"/);
  assert.match(source, /"google\/gemini-2\.5-flash"/);
  assert.match(source, /action: "rephrase"/);
  assert.match(source, /context: "creative and viral"/);
});

test("technical AI identifiers stay LTR while content stays direction-aware", () => {
  const source = readFileSync(resolve(root, "src/components/AIConfig.tsx"), "utf8");

  assert.match(source, /dir="ltr">\{p\.envVar\}<\/span>/);
  assert.match(source, /dir="ltr">\{m\}<\/span>/);
  assert.match(source, /value=\{customModel\}[\s\S]*?dir="ltr"/);
  assert.match(source, /dir="ltr">\{aiConfig\.model\}<\/span>/);
  assert.match(source, /value=\{testText\}[\s\S]*?dir="auto"/);
  assert.match(source, /dir="auto">\{testResult\}<\/p>/);
});

test("playground sample follows UI language until the user edits it", () => {
  const source = readFileSync(resolve(root, "src/components/AIConfig.tsx"), "utf8");

  assert.match(source, /useState\(\(\) => t\("playground\.sample"\)\)/);
  assert.match(source, /if \(!testTextEdited\)/);
  assert.match(source, /setTestText\(t\("playground\.sample"\)\)/);
  assert.match(source, /setTestTextEdited\(true\)/);
});

test("AI UI fallbacks are localized while backend errors remain verbatim", () => {
  const source = readFileSync(resolve(root, "src/components/AIConfig.tsx"), "utf8");

  assert.match(source, /setTestError\(\{ message: data\.error \}\)/);
  assert.match(source, /messageKey: "errors\.generationFallback"/);
  assert.match(source, /messageKey: "errors\.connectionFallback"/);
  assert.match(source, /testError\.messageKey \? t\(testError\.messageKey\) : testError\.message/);
});

test("AI configuration schema remains provider and model only", () => {
  const source = readFileSync(resolve(root, "src/types.ts"), "utf8");
  const match = source.match(/export interface AIConfig \{([\s\S]*?)\n\}/);

  assert.ok(match);
  assert.match(match[1], /provider: "gemini" \| "openrouter";/);
  assert.match(match[1], /model: string;/);
  assert.doesNotMatch(match[1], /language/);
  assert.doesNotMatch(match[1], /style/);
});

test("AI configuration contains no physical inline-direction utilities", () => {
  const source = readFileSync(resolve(root, "src/components/AIConfig.tsx"), "utf8");

  assert.doesNotMatch(source, /\b(?:left|right|pl|pr|ml|mr)-/);
  assert.doesNotMatch(source, /\btext-(?:left|right)\b/);
});
