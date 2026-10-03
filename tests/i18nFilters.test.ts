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

test("all locales expose the same content-filter translation keys", () => {
  const expected = new Set(flattenKeys(i18nResources.en.filters));

  for (const locale of APP_LOCALES) {
    const actual = new Set(flattenKeys(i18nResources[locale].filters));
    assert.deepEqual(actual, expected, `filter keys differ for ${locale}`);
  }
});

test("content filter titles resolve in every supported locale", async () => {
  const i18n = i18next.createInstance();

  await i18n.init({
    resources: i18nResources,
    fallbackLng: "en",
    supportedLngs: [...APP_LOCALES],
    defaultNS: "filters",
    ns: ["filters"],
    interpolation: { escapeValue: false },
  });

  const expected = {
    en: "Content Filters",
    ru: "Фильтры контента",
    ar: "عوامل تصفية المحتوى",
    fa: "فیلترهای محتوا",
  } as const;

  for (const locale of APP_LOCALES) {
    await i18n.changeLanguage(locale);
    assert.equal(i18n.t("header.title"), expected[locale]);
  }
});

test("filter values remain literal data independent of interface translations", () => {
  const source = readFileSync(resolve(root, "src/components/FilterConfig.tsx"), "utf8");

  assert.match(source, /positiveKeywords: \[\.\.\.filters\.positiveKeywords, clean\]/);
  assert.match(source, /negativeKeywords: \[\.\.\.filters\.negativeKeywords, clean\]/);
  assert.match(source, /requiredHashtags: \[\.\.\.filters\.requiredHashtags, clean\]/);
  assert.match(source, /if \(!clean\.startsWith\("#"\)\)/);
  assert.match(source, /clean = `#\$\{clean\}`/);
});

test("keyword and hashtag inputs support mixed text direction", () => {
  const source = readFileSync(resolve(root, "src/components/FilterConfig.tsx"), "utf8");

  assert.ok((source.match(/dir="auto"/g) ?? []).length >= 6);
  assert.match(source, /t\("positive\.inputLabel"\)/);
  assert.match(source, /t\("hashtags\.inputLabel"\)/);
  assert.match(source, /t\("negative\.inputLabel"\)/);
});

test("case-sensitivity control is localized and exposes pressed state", () => {
  const source = readFileSync(resolve(root, "src/components/FilterConfig.tsx"), "utf8");

  assert.match(source, /aria-pressed=\{filters\.caseSensitive\}/);
  assert.match(source, /t\("caseSensitive\.enabled"\)/);
  assert.match(source, /t\("caseSensitive\.disabled"\)/);
  assert.match(source, /caseSensitive: !filters\.caseSensitive/);
});

test("filter rule remove controls identify the literal rule being removed", () => {
  const source = readFileSync(resolve(root, "src/components/FilterConfig.tsx"), "utf8");

  assert.match(source, /t\("positive\.remove", \{ value: kw \}\)/);
  assert.match(source, /t\("hashtags\.remove", \{ value: hash \}\)/);
  assert.match(source, /t\("negative\.remove", \{ value: kw \}\)/);
});

test("content filter management contains no physical inline-direction utilities", () => {
  const source = readFileSync(resolve(root, "src/components/FilterConfig.tsx"), "utf8");

  assert.doesNotMatch(source, /\b(?:left|right|pl|pr|ml|mr)-/);
  assert.doesNotMatch(source, /\btext-(?:left|right)\b/);
});
