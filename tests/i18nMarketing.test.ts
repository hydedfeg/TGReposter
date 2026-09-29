import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
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

function readNestedString(value: unknown, path: string): string {
  let current: unknown = value;

  for (const segment of path.split(".")) {
    assert.ok(current && typeof current === "object" && !Array.isArray(current));
    current = (current as Record<string, unknown>)[segment];
  }

  assert.equal(typeof current, "string");
  return current;
}

test("all locales expose the same marketing translation keys", () => {
  const expected = new Set(flattenKeys(i18nResources.en.marketing));

  for (const locale of APP_LOCALES) {
    const actual = new Set(flattenKeys(i18nResources[locale].marketing));
    assert.deepEqual(actual, expected, `marketing keys differ for ${locale}`);
  }
});

test("marketing hero copy is localized for every supported locale", () => {
  const expected = {
    en: "Turn Telegram noise into a publishing signal.",
    ru: "Превратите шум Telegram в сигнал для публикации.",
    ar: "حوّل ضوضاء Telegram إلى إشارة نشر واضحة.",
    fa: "شلوغی تلگرام را به سیگنال انتشار تبدیل کنید.",
  } as const;

  for (const locale of APP_LOCALES) {
    assert.equal(
      readNestedString(i18nResources[locale].marketing, "hero.title"),
      expected[locale],
    );
  }
});

test("public landing page uses the shared language system before authentication", () => {
  const source = readFileSync(resolve(root, "src/MarketingHome.tsx"), "utf8");

  assert.match(source, /useTranslation\(\["marketing", "common"\]\)/);
  assert.match(source, /<LanguageSelector compact variant="dark"/);
  assert.match(source, /marketing:meta\.title/);
  assert.match(source, /marketing:meta\.description/);
});

test("public landing page is RTL-safe", () => {
  const source = readFileSync(resolve(root, "src/MarketingHome.tsx"), "utf8");
  const physicalUtilityPattern =
    /(?:^|[\s"'])(?:[a-z]+:)*(?:left|right|pl|pr|ml|mr)-[^\s"'}]+|\btext-(?:left|right)\b/g;

  assert.deepEqual(source.match(physicalUtilityPattern) ?? [], []);
  assert.match(source, /getLocaleDirection\(locale\) === "rtl"/);
  assert.match(source, /linear-gradient\(270deg/);
  assert.match(source, /linear-gradient\(90deg/);
  assert.match(source, /rtl-mirror/);
  assert.match(source, /dir="ltr" className="text-sm font-bold text-white"/);
});

test("marketing namespace is registered in i18n resources and startup config", () => {
  const resourcesSource = readFileSync(resolve(root, "src/i18n/resources.ts"), "utf8");
  const i18nSource = readFileSync(resolve(root, "src/i18n/index.ts"), "utf8");

  assert.match(resourcesSource, /marketing: Record<string, unknown>/);
  assert.match(resourcesSource, /marketing: enMarketing/);
  assert.match(resourcesSource, /marketing: ruMarketing/);
  assert.match(resourcesSource, /marketing: arMarketing/);
  assert.match(resourcesSource, /marketing: faMarketing/);
  assert.match(i18nSource, /"marketing"/);
});
