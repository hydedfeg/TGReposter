import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("Vercel previews expose the dashboard only under the dashboard path", () => {
  const main = readFileSync(resolve(root, "src/main.tsx"), "utf8");

  assert.match(main, /hostname === 'api\.tgreposter\.com'/);
  assert.match(main, /hostname\.endsWith\('\.vercel\.app'\)/);
  assert.match(main, /window\.location\.pathname\.startsWith\('\/dashboard'\)/);
  assert.match(main, /isVercelPreviewDashboard/);
  assert.match(main, /if \(!isDashboardHost\) return <MarketingHome \/>/);
});

test("Vercel rewrites dashboard preview paths to the SPA without changing API proxying", () => {
  const config = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8")) as {
    rewrites?: Array<{ source?: string; destination?: string }>;
  };

  assert.ok(
    config.rewrites?.some(
      (rewrite) =>
        rewrite.source === "/dashboard/" &&
        rewrite.destination === "/index.html",
    ),
  );
  assert.ok(
    config.rewrites?.some(
      (rewrite) =>
        rewrite.source === "/dashboard/:path*" &&
        rewrite.destination === "/index.html",
    ),
  );
  assert.ok(
    config.rewrites?.some(
      (rewrite) =>
        rewrite.source === "/api/:path*" &&
        rewrite.destination === "https://api.tgreposter.com/api/:path*",
    ),
  );
});
