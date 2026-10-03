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

test("all locales expose the same team translation keys", () => {
  const expected = new Set(flattenKeys(i18nResources.en.team));

  for (const locale of APP_LOCALES) {
    const actual = new Set(flattenKeys(i18nResources[locale].team));
    assert.deepEqual(actual, expected, `team keys differ for ${locale}`);
  }
});

test("team titles resolve in every supported locale", async () => {
  const i18n = i18next.createInstance();

  await i18n.init({
    resources: i18nResources,
    fallbackLng: "en",
    supportedLngs: [...APP_LOCALES],
    defaultNS: "team",
    ns: ["team"],
    interpolation: { escapeValue: false },
  });

  const expected = {
    en: "Team & Workspace Access",
    ru: "Команда и доступ к рабочим пространствам",
    ar: "الفريق والوصول إلى مساحات العمل",
    fa: "تیم و دسترسی به فضای کاری",
  } as const;

  for (const locale of APP_LOCALES) {
    await i18n.changeLanguage(locale);
    assert.equal(i18n.t("header.title"), expected[locale]);
  }
});

test("role and auth-provider machine values remain stable", () => {
  const source = readFileSync(resolve(root, "src/components/UserManagement.tsx"), "utf8");

  assert.match(source, /useState<"super-admin" \| "admin">\("admin"\)/);
  assert.match(source, /value="admin"/);
  assert.match(source, /value="super-admin"/);
  assert.match(source, /user\.role === "super-admin"/);
  assert.match(source, /user\.authProvider === "supabase"/);
});

test("team dates and member counts use the selected interface locale", () => {
  const source = readFileSync(resolve(root, "src/components/UserManagement.tsx"), "utf8");

  assert.match(source, /normalizeAppLocale\(i18n\.language\)/);
  assert.match(source, /new Intl\.NumberFormat\(locale\)/);
  assert.match(source, /new Intl\.DateTimeFormat\(\`\$\{locale\}-u-ca-gregory\`/);
  assert.match(source, /dateFormatter\.format\(new Date\(user\.createdAt \|\| Date\.now\(\)\)\)/);
});

test("technical credentials stay LTR while usernames support mixed direction", () => {
  const source = readFileSync(resolve(root, "src/components/UserManagement.tsx"), "utf8");

  assert.match(source, /value=\{email\}[\s\S]*?dir="ltr"/);
  assert.match(source, /value=\{password\}[\s\S]*?dir="ltr"/);
  assert.match(source, /dir="auto">\{user\.username\}<\/span>/);
  assert.match(source, /user\.email[\s\S]*?dir="ltr"/);
});

test("UI-generated team feedback is localized while backend errors remain verbatim", () => {
  const source = readFileSync(resolve(root, "src/components/UserManagement.tsx"), "utf8");

  assert.match(source, /messageKey: "feedback\.validEmail"/);
  assert.match(source, /messageKey: "feedback\.passwordLength"/);
  assert.match(source, /messageKey: "feedback\.provisionSuccess"/);
  assert.match(source, /messageKey: "feedback\.provisionFailed"/);
  assert.match(source, /messageKey: "feedback\.revokeSuccess"/);
  assert.match(source, /messageKey: "feedback\.revokeFailed"/);
  assert.match(source, /err\?\.message \? \{ message: err\.message \}/);
  assert.match(source, /error\.messageKey \? t\(error\.messageKey, error\.values\) : error\.message/);
});

test("revoke confirmation follows the selected UI language", () => {
  const source = readFileSync(resolve(root, "src/components/UserManagement.tsx"), "utf8");

  assert.match(source, /window\.confirm\(/);
  assert.match(source, /t\("feedback\.revokeConfirm", \{ identity \}\)/);
});

test("team management contains no physical inline-direction utilities", () => {
  const source = readFileSync(resolve(root, "src/components/UserManagement.tsx"), "utf8");

  assert.doesNotMatch(source, /\b(?:left|right|pl|pr|ml|mr)-/);
  assert.doesNotMatch(source, /\btext-(?:left|right)\b/);
});
