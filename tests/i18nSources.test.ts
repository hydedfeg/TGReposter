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

test("all locales expose the same source-channel translation keys", () => {
  const expected = new Set(flattenKeys(i18nResources.en.sources));

  for (const locale of APP_LOCALES) {
    const actual = new Set(flattenKeys(i18nResources[locale].sources));
    assert.deepEqual(actual, expected, `source keys differ for ${locale}`);
  }
});

test("source channel titles resolve in every supported locale", async () => {
  const i18n = i18next.createInstance();

  await i18n.init({
    resources: i18nResources,
    fallbackLng: "en",
    supportedLngs: [...APP_LOCALES],
    defaultNS: "sources",
    ns: ["sources"],
    interpolation: { escapeValue: false },
  });

  const expected = {
    en: "Source Channels",
    ru: "Каналы-источники",
    ar: "قنوات المصدر",
    fa: "کانال‌های منبع",
  } as const;

  for (const locale of APP_LOCALES) {
    await i18n.changeLanguage(locale);
    assert.equal(i18n.t("header.title"), expected[locale]);
  }
});

test("source management uses selected locale for scrape timestamps", () => {
  const source = readFileSync(resolve(root, "src/components/SourceChannelsConfig.tsx"), "utf8");

  assert.match(source, /normalizeAppLocale\(i18n\.language\)/);
  assert.match(source, /new Intl\.DateTimeFormat\(\`\$\{locale\}-u-ca-gregory\`/);
  assert.match(source, /dateTimeFormatter\.format\(new Date\(channel\.lastFetched\)\)/);
});

test("source validation remains reactive to interface-language changes", () => {
  const source = readFileSync(resolve(root, "src/components/SourceChannelsConfig.tsx"), "utf8");

  assert.match(source, /setInputErrorKey\("validation\.usernameRequired"\)/);
  assert.match(source, /setInputErrorKey\("validation\.duplicate"\)/);
  assert.match(source, /\{t\(inputErrorKey\)\}/);
  assert.doesNotMatch(source, /Username cannot be empty/);
  assert.doesNotMatch(source, /Channel already exists/);
});

test("Telegram identifiers stay LTR while raw channel errors use automatic direction", () => {
  const source = readFileSync(resolve(root, "src/components/SourceChannelsConfig.tsx"), "utf8");

  assert.match(source, /type="text"[\s\S]*?dir="ltr"/);
  assert.match(source, /t\.me\/\{channel\.username\}[\s\S]*?<\/p>/);
  assert.match(source, /channel\.errorMessage/);
  assert.match(source, /dir="auto"/);
});

test("source management contains no physical inline-direction utilities", () => {
  const source = readFileSync(resolve(root, "src/components/SourceChannelsConfig.tsx"), "utf8");

  assert.doesNotMatch(source, /\b(?:left|right|pl|pr|ml|mr)-/);
  assert.doesNotMatch(source, /\btext-(?:left|right)\b/);
});
