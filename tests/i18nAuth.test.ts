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

test("all locales expose the same authentication translation keys", () => {
  const expected = new Set(flattenKeys(i18nResources.en.auth));

  for (const locale of APP_LOCALES) {
    const actual = new Set(flattenKeys(i18nResources[locale].auth));
    assert.deepEqual(actual, expected, `auth keys differ for ${locale}`);
  }
});

test("authentication strings resolve in every supported locale", async () => {
  const i18n = i18next.createInstance();

  await i18n.init({
    resources: i18nResources,
    fallbackLng: "en",
    supportedLngs: [...APP_LOCALES],
    defaultNS: "auth",
    ns: ["auth"],
    interpolation: { escapeValue: false },
  });

  const expectedTitles = {
    en: "Sign in to TGReposter",
    ru: "Войти в TGReposter",
    ar: "تسجيل الدخول إلى TGReposter",
    fa: "ورود به TGReposter",
  } as const;

  for (const locale of APP_LOCALES) {
    await i18n.changeLanguage(locale);
    assert.equal(i18n.t("title.signIn"), expectedTitles[locale]);
  }
});

test("login renders translated copy and mixed-direction-safe credentials", () => {
  const source = readFileSync(resolve(root, "src/components/Login.tsx"), "utf8");

  assert.match(source, /useTranslation\("auth"\)/);
  assert.match(source, /t\("title\.signIn"\)/);
  assert.match(source, /t\("fields\.usernameOrEmail"\)/);
  assert.match(source, /t\("actions\.showPassword"\)/);
  assert.match(source, /setErrorKey\("validation\.identityRequired"\)/);
  assert.match(source, /dir="auto"/);
  assert.match(source, /dir="ltr"/);
});
