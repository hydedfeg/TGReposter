import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import i18next from "i18next";
import { I18nextProvider } from "react-i18next";
import en from "../src/i18n/locales/en/billing";
import ru from "../src/i18n/locales/ru/billing";
import ar from "../src/i18n/locales/ar/billing";
import fa from "../src/i18n/locales/fa/billing";

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "Content-Type": "application/json" },
});
test("subscription management copy has identical keys and complete translations in every locale", () => {
  for (const locale of [ru, ar, fa]) {
    assert.deepEqual(Object.keys(locale.management).sort(), Object.keys(en.management).sort());
    for (const value of Object.values(locale.management)) assert.ok(value.trim().length > 0);
  }
});
test("customer cancellation requires server availability, confirmation and the current session", async t => {
  const directory = await mkdtemp(path.join(import.meta.dirname, "../.test-subscription-"));
  const bundle = path.join(directory, "management.mjs");
  await build({ entryPoints: [path.join(import.meta.dirname, "../src/components/SubscriptionManagement.tsx")],
    outfile: bundle, bundle: true, platform: "node", format: "esm", packages: "external" });
  const { default: Management } = await import(bundle);
  const dom = new JSDOM('<div id="root"></div>');
  const previousFetch = globalThis.fetch;
  const globals = ["window", "document", "IS_REACT_ACT_ENVIRONMENT"];
  const previous = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.getElementById("root")!;
  let root: ReturnType<typeof createRoot> | undefined;
  let changed = 0;
  let calls: Array<{ url: string; init?: RequestInit }> = [];
  let handler: (url: string, init?: RequestInit) => Promise<Response>;
  const i18n = i18next.createInstance();
  await i18n.init({ lng: "en", fallbackLng: "en", resources: { en: { billing: en }, ru: { billing: ru }, ar: { billing: ar }, fa: { billing: fa } } });
  const mount = async (cancel = false, token = "alice-token") => {
    changed = 0; calls = [];
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return handler(String(input), init);
    };
    root = createRoot(container);
    await act(async () => root!.render(React.createElement(I18nextProvider, { i18n },
      React.createElement(Management, { key: token, authToken: token, cancelAtPeriodEnd: cancel,
        periodEnd: "2030-01-01T00:00:00Z", onChanged: () => { changed++; } }))));
  };
  const unmount = async () => { if (root) { await act(async () => root!.unmount()); root = undefined; } };
  const click = async (label: string) => {
    const button = [...container.querySelectorAll("button")].find(button => button.textContent === label);
    assert.ok(button, `Missing button: ${label}`);
    await act(async () => button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
  };
  try {
    await t.test("disabled, failed and malformed availability never offer a mutation", async () => {
      for (const response of [json({ enabled: false }), json({ enabled: "true" }), json({ enabled: true }, 503)]) {
        handler = async () => response;
        await mount();
        assert.equal(container.querySelector("button"), null);
        assert.equal(calls.length, 1);
        await unmount();
      }
    });
    await t.test("each locale confirms cancellation and sends only a boolean with the authenticated token", async () => {
      for (const locale of ["en", "ru", "ar", "fa"]) {
        await i18n.changeLanguage(locale);
        handler = async (_url, init) => init?.method === "POST"
          ? json({ cancellation: { cancelAtPeriodEnd: true } }) : json({ enabled: true });
        await mount();
        await click(i18n.t("management.cancel", { ns: "billing" }));
        assert.equal(calls.length, 1);
        await click(i18n.t("management.confirm", { ns: "billing" }));
        const mutation = calls[1];
        assert.equal(mutation.url, "/api/billing/subscription/cancellation");
        assert.equal(new Headers(mutation.init?.headers).get("Authorization"), "Bearer alice-token");
        assert.deepEqual(JSON.parse(String(mutation.init?.body)), { cancelAtPeriodEnd: true });
        assert.equal(changed, 1);
        await unmount();
      }
      await i18n.changeLanguage("en");
    });
    await t.test("reversal uses false; payment-review failure preserves the displayed preference", async () => {
      handler = async (_url, init) => init?.method === "POST"
        ? json({ code: "PAYMENT_REVIEW_REQUIRED" }, 409) : json({ enabled: true });
      await mount(true);
      await click(en.management.restore);
      await click(en.management.confirm);
      assert.deepEqual(JSON.parse(String(calls[1].init?.body)), { cancelAtPeriodEnd: false });
      assert.equal(changed, 0);
      assert.match(container.querySelector('[role="alert"]')!.textContent!, /outstanding payment/);
      await unmount();
    });
    await t.test("network uncertainty never claims success and a refresh is available", async () => {
      handler = async (_url, init) => {
        if (init?.method === "POST") throw Error("connection interrupted");
        return json({ enabled: true });
      };
      await mount();
      await click(en.management.cancel); await click(en.management.confirm);
      assert.equal(changed, 0);
      assert.match(container.querySelector('[role="alert"]')!.textContent!, /may have been saved/);
      await click(en.refresh);
      assert.equal(changed, 1);
      await unmount();
    });
    await t.test("late mutation response after account unmount cannot refresh the next account", async () => {
      let resolve!: (response: Response) => void;
      const response = new Promise<Response>(done => { resolve = done; });
      handler = async (_url, init) => init?.method === "POST" ? response : json({ enabled: true });
      await mount();
      await click(en.management.cancel); await click(en.management.confirm);
      // A second click while the first request is unresolved cannot issue another mutation.
      await click(en.management.saving);
      assert.equal(calls.filter(call => call.init?.method === "POST").length, 1);
      await unmount();
      await act(async () => { resolve(json({ cancellation: { cancelAtPeriodEnd: true } })); });
      assert.equal(changed, 0);
    });
  } finally {
    await unmount(); globalThis.fetch = previousFetch;
    for (const key of globals) {
      const descriptor = previous.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as any)[key];
    }
    dom.window.close(); await rm(directory, { recursive: true, force: true });
  }
});
