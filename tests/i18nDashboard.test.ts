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

test("all locales expose the same dashboard translation keys", () => {
  const expected = new Set(flattenKeys(i18nResources.en.dashboard));

  for (const locale of APP_LOCALES) {
    const actual = new Set(flattenKeys(i18nResources[locale].dashboard));
    assert.deepEqual(actual, expected, `dashboard keys differ for ${locale}`);
  }
});

test("dashboard titles resolve in every supported locale", async () => {
  const i18n = i18next.createInstance();

  await i18n.init({
    resources: i18nResources,
    fallbackLng: "en",
    supportedLngs: [...APP_LOCALES],
    defaultNS: "dashboard",
    ns: ["dashboard"],
    interpolation: { escapeValue: false },
  });

  const expected = {
    en: "At a glance",
    ru: "Краткий обзор",
    ar: "نظرة سريعة",
    fa: "نمای کلی",
  } as const;

  for (const locale of APP_LOCALES) {
    await i18n.changeLanguage(locale);
    assert.equal(i18n.t("hero.title"), expected[locale]);
  }
});

test("dashboard binds dates and numbers to the selected app locale", () => {
  const source = readFileSync(resolve(root, "src/components/Dashboard.tsx"), "utf8");

  assert.match(source, /normalizeAppLocale\(i18n\.language\)/);
  assert.match(source, /new Intl\.NumberFormat\(locale\)/);
  assert.match(source, /style: "percent"/);
  assert.match(source, /new Intl\.DateTimeFormat\(\`\$\{locale\}-u-ca-gregory\`/);
});

test("dashboard preserves mixed-direction Telegram content", () => {
  const source = readFileSync(resolve(root, "src/components/Dashboard.tsx"), "utf8");

  assert.match(source, /dir="auto"/);
  assert.match(source, /t\("queue\.mediaPost"\)/);
  assert.doesNotMatch(source, />At a glance</);
  assert.doesNotMatch(source, />Sync sources</);
});
