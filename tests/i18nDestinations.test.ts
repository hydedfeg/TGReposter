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

test("all locales expose the same destination translation keys", () => {
  const expected = new Set(flattenKeys(i18nResources.en.destinations));

  for (const locale of APP_LOCALES) {
    const actual = new Set(flattenKeys(i18nResources[locale].destinations));
    assert.deepEqual(actual, expected, `destination keys differ for ${locale}`);
  }
});

test("destination titles resolve in every supported locale", async () => {
  const i18n = i18next.createInstance();

  await i18n.init({
    resources: i18nResources,
    fallbackLng: "en",
    supportedLngs: [...APP_LOCALES],
    defaultNS: "destinations",
    ns: ["destinations"],
    interpolation: { escapeValue: false },
  });

  const expected = {
    en: "2. Destination Channels & Groups",
    ru: "2. Каналы и группы назначения",
    ar: "2. قنوات ومجموعات الوجهة",
    fa: "۲. کانال‌ها و گروه‌های مقصد",
  } as const;

  for (const locale of APP_LOCALES) {
    await i18n.changeLanguage(locale);
    assert.equal(i18n.t("targets.title"), expected[locale]);
  }
});

test("destination technical credentials and IDs stay LTR", () => {
  const source = readFileSync(resolve(root, "src/components/DestinationConfig.tsx"), "utf8");

  assert.match(source, /value=\{botToken\}[\s\S]*?dir="ltr"/);
  assert.match(source, /value=\{newTargetChannelId\}[\s\S]*?dir="ltr"/);
  assert.match(source, /\{target\.channelId\}<\/p>/);
  assert.match(source, /<code dir="ltr">-100<\/code>/);
  assert.match(source, /<code dir="ltr">@userinfobot<\/code>/);
});

test("friendly names and raw feedback support automatic text direction", () => {
  const source = readFileSync(resolve(root, "src/components/DestinationConfig.tsx"), "utf8");

  assert.match(source, /value=\{newTargetName\}[\s\S]*?dir="auto"/);
  assert.match(source, /dir="auto">\{target\.name\}<\/h4>/);
  assert.match(source, /targetTestResult\.messageKey \? t\(targetTestResult\.messageKey/);
  assert.match(source, /\? \{ message: data\.error \}/);
});

test("destination UI-generated feedback uses translation keys", () => {
  const source = readFileSync(resolve(root, "src/components/DestinationConfig.tsx"), "utf8");

  assert.match(source, /messageKey: "feedback\.saveTokenFirst"/);
  assert.match(source, /messageKey: "feedback\.testPublished"/);
  assert.match(source, /messageKey: "feedback\.connectionFallback"/);
  assert.match(source, /messageKey: "feedback\.enterToken"/);
  assert.match(source, /messageKey: "feedback\.tokenStored"/);
  assert.match(source, /messageKey: "feedback\.tokenSaveFailed"/);
  assert.match(source, /setTargetFormErrorKey\("feedback\.targetNameRequired"\)/);
  assert.match(source, /setTargetFormErrorKey\("feedback\.channelIdRequired"\)/);
});

test("destination normalization and owner-scoped save calls stay unchanged", () => {
  const source = readFileSync(resolve(root, "src/components/DestinationConfig.tsx"), "utf8");

  assert.match(source, /if \(!cleanChannelId\.startsWith\("@"\) && !cleanChannelId\.startsWith\("-"\)/);
  assert.match(source, /cleanChannelId = `@\$\{cleanChannelId\}`/);
  assert.match(source, /onSave\("", updatedTargets\)/);
  assert.match(source, /onSave\(token, targets\)/);
});

test("destination management contains no physical inline-direction utilities", () => {
  const source = readFileSync(resolve(root, "src/components/DestinationConfig.tsx"), "utf8");

  assert.doesNotMatch(source, /\b(?:left|right|pl|pr|ml|mr)-/);
  assert.doesNotMatch(source, /\btext-(?:left|right)\b/);
});
