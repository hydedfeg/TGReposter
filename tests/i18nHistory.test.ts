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

test("all locales expose the same publishing history translation keys", () => {
  const expected = new Set(flattenKeys(i18nResources.en.history));

  for (const locale of APP_LOCALES) {
    const actual = new Set(flattenKeys(i18nResources[locale].history));
    assert.deepEqual(actual, expected, `history keys differ for ${locale}`);
  }
});

test("publishing history title resolves in every supported locale", async () => {
  const i18n = i18next.createInstance();

  await i18n.init({
    resources: i18nResources,
    fallbackLng: "en",
    supportedLngs: [...APP_LOCALES],
    defaultNS: "history",
    ns: ["history"],
    interpolation: { escapeValue: false },
  });

  const expected = {
    en: "Publishing history",
    ru: "История публикаций",
    ar: "سجل النشر",
    fa: "تاریخچه انتشار",
  } as const;

  for (const locale of APP_LOCALES) {
    await i18n.changeLanguage(locale);
    assert.equal(i18n.t("header.title"), expected[locale]);
  }
});

test("history route selects the read-only history mode", () => {
  const source = readFileSync(resolve(root, "src/App.tsx"), "utf8");

  assert.match(source, /mode=\{activeWorkspaceTab === "history" \? "history" : "review"\}/);
  assert.match(source, /initialTab=\{activeWorkspaceTab === "history" \? "posted" : "pending"\}/);
});

test("history mode is constrained to published posts and publication timestamps", () => {
  const source = readFileSync(resolve(root, "src/components/CurationFeed.tsx"), "utf8");

  assert.match(source, /const isHistory = mode === "history"/);
  assert.match(source, /post\.status !== \(isHistory \? "posted" : activeTab\)/);
  assert.match(source, /isHistory && post\.postedAt \? post\.postedAt : post\.date/);
  assert.match(source, /selectedPost\.postedAt/);
});

test("history mode is read-only and preserves stored delivery notes", () => {
  const source = readFileSync(resolve(root, "src/components/CurationFeed.tsx"), "utf8");

  assert.match(source, /isHistory \? renderHistoryDetails\(\) : renderEditor\(\)/);
  assert.match(source, /!isHistory \? \(/);
  assert.match(source, /selectedPost\.errorMessage/);
  assert.match(source, /th\("details\.deliveryNote"\)/);
  assert.match(source, /dir="auto">\{selectedPost\.errorMessage\}/);
});

test("history does not invent per-destination result data", () => {
  const source = readFileSync(resolve(root, "src/components/CurationFeed.tsx"), "utf8");

  assert.doesNotMatch(source, /publicationResults/);
  assert.doesNotMatch(source, /deliveryResults/);
  assert.match(source, /errorMessage/);
});
