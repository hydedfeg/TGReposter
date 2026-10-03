import assert from "node:assert/strict";
import test from "node:test";
import {
  APP_LOCALE_DEFINITIONS,
  DEFAULT_APP_LOCALE,
  getLocaleDirection,
  normalizeAppLocale,
} from "../src/i18n/locales";

test("normalizes supported locale variants", () => {
  assert.equal(normalizeAppLocale("ru-RU"), "ru");
  assert.equal(normalizeAppLocale("ar_SA"), "ar");
  assert.equal(normalizeAppLocale("fa-IR"), "fa");
  assert.equal(normalizeAppLocale("en-US"), "en");
});

test("falls back to English for missing or unsupported locales", () => {
  assert.equal(normalizeAppLocale(undefined), DEFAULT_APP_LOCALE);
  assert.equal(normalizeAppLocale("fr-FR"), DEFAULT_APP_LOCALE);
});

test("defines the correct interface direction for every supported locale", () => {
  assert.equal(getLocaleDirection("en"), "ltr");
  assert.equal(getLocaleDirection("ru"), "ltr");
  assert.equal(getLocaleDirection("ar"), "rtl");
  assert.equal(getLocaleDirection("fa"), "rtl");

  assert.equal(APP_LOCALE_DEFINITIONS.ar.nativeName, "العربية");
  assert.equal(APP_LOCALE_DEFINITIONS.fa.nativeName, "فارسی");
});
