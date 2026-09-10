import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const repoRoot = path.resolve(import.meta.dirname, "..");
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json" },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function workspace(owner: string) {
  return {
    channels: [{ username: `${owner}-private-source` }],
    filters: { positiveKeywords: [], negativeKeywords: [], requiredHashtags: [], caseSensitive: false },
    destination: { botToken: "", connected: true, targets: [{ id: owner, name: `${owner}-destination`, enabled: true }] },
    posts: [{ id: "same-channel/1", text: `${owner}-private-post`, originalText: "Original", status: "pending" }],
    users: [{ username: `${owner}-private-team` }], passwordSet: true,
  };
}

test("account switching protects mounted workspace state and requests", async t => {
  const directory = await mkdtemp(path.join(repoRoot, ".test-account-switch-"));
  const bundle = path.join(directory, "App.mjs");
  // Render the real App with small view substitutes. Requests, state, effects,
  // session transitions and browser storage all run through production code.
  await build({
    entryPoints: [path.join(repoRoot, "src/App.tsx"), path.join(repoRoot, "src/PromotionPage.tsx")], outdir: directory, outExtension: { ".js": ".mjs" },
    bundle: true, platform: "node", format: "esm", packages: "external",
    plugins: [{ name: "views", setup(builder) {
      builder.onResolve({ filter: /\.\/components\// }, args => ({ path: path.basename(args.path), namespace: "view" }));
      builder.onLoad({ filter: /.*/, namespace: "view" }, args => ({
        loader: "jsx", resolveDir: repoRoot, contents: `import React from 'react';
          export default function View(props) {
            globalThis.__workspaceViews[${JSON.stringify(args.path)}] = props;
            return <section data-view=${JSON.stringify(args.path)}>{JSON.stringify({...props, children: undefined})}{props.children}</section>;
          }`,
      }));
    }}],
  });
  const { default: App } = await import(bundle);
  const { default: PromotionPage } = await import(path.join(directory, "PromotionPage.mjs"));
  const originalFetch = globalThis.fetch;
  const dom = new JSDOM('<div id="root"></div>', { url: "https://app.example/" });
  const globals = ["window", "document", "localStorage", "sessionStorage", "IS_REACT_ACT_ENVIRONMENT", "__workspaceViews"];
  const previous = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document,
    localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage,
    IS_REACT_ACT_ENVIRONMENT: true, __workspaceViews: {} });
  const views = () => (globalThis as any).__workspaceViews;
  const container = document.getElementById("root")!;
  let root: ReturnType<typeof createRoot>;
  let calls: { url: string; token: string | null; body: any }[];
  let handler: (url: string, token: string | null, body: any) => Promise<Response>;
  const login = async (owner: string) => {
    await act(async () => views().Login.onSuccess(`${owner}-token`, false, "admin", owner, `supabase:${owner}`));
  };
  const logout = async () => {
    // Deliberately don't wait for the server logout response.
    await act(async () => { void views().AppShell.onLogout(); });
  };
  const mountAlice = async (Component = App) => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem("curator_token", "alice-token");
    localStorage.setItem("curator_account_key", "supabase:alice");
    (globalThis as any).__workspaceViews = {};
    calls = [];
    handler = async (_url, token) => json(workspace(token === "bob-token" ? "bob" : "alice"));
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      const token = new Headers(init?.headers).get("Authorization")?.replace("Bearer ", "") ?? null;
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url, token, body });
      if (url === "/api/auth/status") return json({ authenticated: true, passwordSet: true,
        username: "alice", role: "admin", accountKey: "supabase:alice" });
      if (url === "/api/auth/logout") return new Promise<Response>(() => {});
      return handler(url, token, body);
    };
    root = createRoot(container);
    await act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(Component))));
    assert.match(container.textContent!, /alice-private-post/);
  };
  const unmount = async () => { await act(async () => root.unmount()); };
  try {
    await t.test("logout clears state before network completes; failed next-user load stays empty", async () => {
      await mountAlice();
      await logout();
      assert.doesNotMatch(container.textContent!, /alice-private/);
      handler = async () => json({ error: "offline" }, 503);
      await login("bob");
      assert.doesNotMatch(container.textContent!, /alice-private/);
      assert.deepEqual(views().Dashboard.settings.posts, []);
      assert.equal(localStorage.getItem("telegram-curator-settings:supabase:bob"), null);
      await unmount();
    });
    await t.test("late scrape response cannot overwrite Bob's state or either cache", async () => {
      await mountAlice();
      const pending = deferred<Response>();
      handler = async (url, token) => url === "/api/fetch-posts" ? pending.promise : json(workspace(token === "bob-token" ? "bob" : "alice"));
      let scrape: Promise<void>;
      await act(async () => { scrape = views().Dashboard.onSync(); });
      await logout(); await login("bob");
      await act(async () => { pending.resolve(json({ ...workspace("alice"), fetchedCount: 3 })); await scrape; });
      assert.match(container.textContent!, /bob-private-post/);
      assert.doesNotMatch(container.textContent!, /alice-private/);
      assert.doesNotMatch(localStorage.getItem("telegram-curator-settings:supabase:bob")!, /alice-private/);
      assert.equal(localStorage.getItem("telegram-curator-settings:supabase:alice"), null);
      await unmount();
    });
    await t.test("late channel save cannot auto-scrape under the next account", async () => {
      await mountAlice();
      await act(async () => views().AppShell.onNavigate("channels"));
      const pending = deferred<Response>();
      handler = async (url, token, body) => url === "/api/settings" && body ? pending.promise : json(workspace(token === "bob-token" ? "bob" : "alice"));
      let save: Promise<void>;
      await act(async () => { save = views().SourceChannelsConfig.onAddChannel("alice-new-source"); });
      await logout(); await login("bob");
      await act(async () => { pending.resolve(json(workspace("alice"))); await save; });
      assert.equal(calls.filter(call => call.url === "/api/fetch-posts").length, 0);
      assert.doesNotMatch(container.textContent!, /alice-private|alice-new-source/);
      assert.doesNotMatch(localStorage.getItem("telegram-curator-settings:supabase:bob")!, /alice/);
      await unmount();
    });
    await t.test("late publishing failure cannot save an error into Bob's identically named post", async () => {
      await mountAlice();
      await act(async () => views().AppShell.onNavigate("feed"));
      const oldEdit = views().CurationFeed.onUpdatePost;
      const pending = deferred<Response>();
      handler = async (url, token) => url === "/api/post-telegram" ? pending.promise : json(workspace(token === "bob-token" ? "bob" : "alice"));
      let publish: Promise<boolean>;
      await act(async () => { publish = views().CurationFeed.onPostToTelegram("same-channel/1", "Alice copy"); });
      await logout(); await login("bob");
      await act(async () => {
        pending.resolve(json({ error: "Alice failure" }, 500));
        assert.equal(await publish, false);
        await oldEdit("same-channel/1", { text: "Alice delayed AI copy" });
      });
      assert.equal(calls.filter(call => call.url === "/api/settings" && call.body).length, 0);
      assert.doesNotMatch(container.textContent!, /Alice failure|Alice delayed|alice-private/);
      await unmount();
    });
    await t.test("a stale settings body cannot repopulate an unmounted page", async () => {
      await mountAlice();
      await logout();
      const pending = deferred<any>();
      handler = async () => ({ ok: true, status: 200, headers: new Headers({ "Content-Type": "application/json" }), json: () => pending.promise }) as Response;
      await login("bob");
      await unmount();
      await act(async () => { pending.resolve(workspace("bob")); });
      assert.equal(localStorage.getItem("telegram-curator-settings:supabase:bob"), null);
    });
    await t.test("a current 401 clears the workspace instead of falling back to cached content", async () => {
      await mountAlice(); await logout();
      localStorage.setItem("telegram-curator-settings:supabase:bob", JSON.stringify(workspace("bob")));
      handler = async () => json({ error: "Unauthorized" }, 401);
      await login("bob");
      assert.doesNotMatch(container.textContent!, /alice-private|bob-private/);
      assert.equal(localStorage.getItem("curator_token"), null);
      assert.equal(localStorage.getItem("telegram-curator-settings:supabase:bob"), null);
      await unmount();
    });
    await t.test("another tab changing account hides the workspace and invalidates old callbacks", async () => {
      await mountAlice();
      const oldSync = views().Dashboard.onSync;
      await act(async () => {
        localStorage.setItem("curator_token", "bob-token");
        window.dispatchEvent(new dom.window.StorageEvent("storage", { key: "curator_token", newValue: "bob-token" }));
        await oldSync();
      });
      assert.doesNotMatch(container.textContent!, /alice-private/);
      assert.equal(calls.filter(call => call.url === "/api/fetch-posts").length, 0);
      assert.equal(localStorage.getItem("curator_token"), "bob-token");
      await unmount();
    });
    await t.test("a render before the cross-tab storage event cannot bind Alice's callbacks to Bob", async () => {
      await mountAlice();
      localStorage.setItem("curator_token", "bob-token");
      // Force a render while the browser's storage notification is still queued.
      await act(async () => views().AppShell.onNavigate("feed"));
      await act(async () => views().CurationFeed.onTriggerScrape());
      assert.equal(calls.filter(call => call.url === "/api/fetch-posts").length, 0);
      await unmount();
    });
    await t.test("campaign logout unmounts private campaign data before its network response", async () => {
      await mountAlice(PromotionPage);
      await logout();
      assert.doesNotMatch(container.textContent!, /alice-private/);
      assert.equal(localStorage.getItem("curator_token"), null);
      await unmount();
    });
    await t.test("another tab changing account immediately clears the campaign workspace", async () => {
      await mountAlice(PromotionPage);
      await act(async () => {
        localStorage.setItem("curator_token", "bob-token");
        window.dispatchEvent(new dom.window.StorageEvent("storage", { key: "curator_token", newValue: "bob-token" }));
      });
      assert.doesNotMatch(container.textContent!, /alice-private/);
      assert.equal(localStorage.getItem("curator_token"), "bob-token");
      await unmount();
    });

  } finally {
    globalThis.fetch = originalFetch;
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as any)[key];
    }
    await rm(directory, { recursive: true, force: true });
  }
});
