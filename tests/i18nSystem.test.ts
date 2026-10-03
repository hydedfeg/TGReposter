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

test("all locales expose the same system-settings translation keys", () => {
  const expected = new Set(flattenKeys(i18nResources.en.system));

  for (const locale of APP_LOCALES) {
    const actual = new Set(flattenKeys(i18nResources[locale].system));
    assert.deepEqual(actual, expected, `system keys differ for ${locale}`);
  }
});

test("system settings titles resolve in every supported locale", async () => {
  const i18n = i18next.createInstance();

  await i18n.init({
    resources: i18nResources,
    fallbackLng: "en",
    supportedLngs: [...APP_LOCALES],
    defaultNS: "system",
    ns: ["system"],
    interpolation: { escapeValue: false },
  });

  const expected = {
    en: "System Architecture & Health",
    ru: "Архитектура и состояние системы",
    ar: "بنية النظام وحالته",
    fa: "معماری و سلامت سیستم",
  } as const;

  for (const locale of APP_LOCALES) {
    await i18n.changeLanguage(locale);
    assert.equal(i18n.t("header.title"), expected[locale]);
  }
});

test("system diagnostics keep backend machine identifiers stable", () => {
  const source = readFileSync(resolve(root, "src/components/DatabaseConfig.tsx"), "utf8");

  assert.match(source, /backendMode: "normalized-postgres" \| "unavailable"/);
  assert.match(source, /health\.backendMode === "normalized-postgres"/);
  assert.match(source, /source_channels: "personal"/);
  assert.match(source, /curator_settings: "compatibility"/);
  assert.match(source, /schedule === "\*\/5 \* \* \* \*"/);
  assert.match(source, /schedule === "0 \* \* \* \*"/);
  assert.match(source, /name === "tgreposter-inbox-import"/);
  assert.match(source, /name === "tgreposter-inbox-cleanup"/);
});

test("system metrics and timestamps follow the selected interface locale", () => {
  const source = readFileSync(resolve(root, "src/components/DatabaseConfig.tsx"), "utf8");

  assert.match(source, /normalizeAppLocale\(i18n\.language\)/);
  assert.match(source, /new Intl\.NumberFormat\(locale\)/);
  assert.match(source, /new Intl\.DateTimeFormat\(\`\$\{locale\}-u-ca-gregory\`/);
  assert.match(source, /dateTimeFormatter\.format\(date\)/);
  assert.match(source, /formattedCount: numberFormatter\.format\(count\)/);
});

test("technical system values stay readable while raw diagnostics remain verbatim", () => {
  const source = readFileSync(resolve(root, "src/components/DatabaseConfig.tsx"), "utf8");

  assert.match(source, /dir="ltr">[\s\S]*?\{health\.supabaseUrl/);
  assert.match(source, /dir="ltr">[\s\S]*?\{table\.name\}/);
  assert.match(source, /\{job\.name\} · \{job\.schedule\}/);
  assert.match(source, /job\.lastReturnMessage/);
  assert.match(source, /dir="auto">[\s\S]*?· \{job\.lastReturnMessage\}/);
  assert.match(source, /\{health\.error \|\|/);
});

test("system UI-generated fallback errors use translation keys", () => {
  const source = readFileSync(resolve(root, "src/components/DatabaseConfig.tsx"), "utf8");

  assert.match(source, /messageKey: "unavailable\.fetchFailed"/);
  assert.match(source, /messageKey: "unavailable\.healthFailed"/);
  assert.match(source, /error\.messageKey \? t\(error\.messageKey\) : error\.message/);
});

test("system settings contains no physical inline-direction utilities", () => {
  const source = readFileSync(resolve(root, "src/components/DatabaseConfig.tsx"), "utf8");

  assert.doesNotMatch(source, /\b(?:left|right|pl|pr|ml|mr)-/);
  assert.doesNotMatch(source, /\btext-(?:left|right)\b/);
});
