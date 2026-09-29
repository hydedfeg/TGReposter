import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("language selector is available before and after authentication", () => {
  const login = readFileSync(resolve(root, "src/components/Login.tsx"), "utf8");
  const shell = readFileSync(resolve(root, "src/components/AppShell.tsx"), "utf8");

  assert.match(login, /<LanguageSelector\s*\/>/);
  assert.match(shell, /<LanguageSelector compact\s*\/>/);
});

test("changing the app locale persists it and updates document language and direction", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://api.tgreposter.com/",
  });

  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: dom.window,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: dom.window.document,
  });

  try {
    const {
      APP_LOCALE_STORAGE_KEY,
      changeAppLocale,
    } = await import("../src/i18n/index");

    await changeAppLocale("fa");
    assert.equal(dom.window.localStorage.getItem(APP_LOCALE_STORAGE_KEY), "fa");
    assert.equal(dom.window.document.documentElement.lang, "fa");
    assert.equal(dom.window.document.documentElement.dir, "rtl");

    await changeAppLocale("ar");
    assert.equal(dom.window.document.documentElement.lang, "ar");
    assert.equal(dom.window.document.documentElement.dir, "rtl");

    await changeAppLocale("en");
    assert.equal(dom.window.localStorage.getItem(APP_LOCALE_STORAGE_KEY), "en");
    assert.equal(dom.window.document.documentElement.lang, "en");
    assert.equal(dom.window.document.documentElement.dir, "ltr");
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: previousWindow,
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: previousDocument,
    });
    dom.window.close();
  }
});
