import assert from "node:assert/strict";
import test from "node:test";
import i18next from "i18next";
import { i18nResources } from "../src/i18n/resources";
import { APP_LOCALES } from "../src/i18n/locales";

const pluralSuffix = /_(zero|one|two|few|many|other)$/;

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix.replace(pluralSuffix, "")] : [];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key)
  );
}

test("all locales expose the same logical navigation translation keys", () => {
  const expected = new Set(flattenKeys(i18nResources.en.navigation));

  for (const locale of APP_LOCALES) {
    const actual = new Set(flattenKeys(i18nResources[locale].navigation));
    assert.deepEqual(actual, expected, `navigation keys differ for ${locale}`);
  }
});

test("publishing target status uses locale-aware plural forms", async () => {
  const i18n = i18next.createInstance();

  await i18n.init({
    resources: i18nResources,
    fallbackLng: "en",
    supportedLngs: [...APP_LOCALES],
    defaultNS: "navigation",
    ns: ["navigation"],
    interpolation: { escapeValue: false },
  });

  await i18n.changeLanguage("en");
  assert.equal(i18n.t("status.publishingTargetsReady", { count: 2 }), "2 publishing targets ready");

  await i18n.changeLanguage("ru");
  assert.equal(i18n.t("status.publishingTargetsReady", { count: 2 }), "2 канала назначения готовы");

  await i18n.changeLanguage("ar");
  assert.equal(i18n.t("status.publishingTargetsReady", { count: 2 }), "وجهتا نشر جاهزتان");

  await i18n.changeLanguage("fa");
  assert.equal(i18n.t("status.publishingTargetsReady", { count: 2 }), "2 مقصد انتشار آماده است");
});
