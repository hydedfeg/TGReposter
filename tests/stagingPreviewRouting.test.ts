import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getMarketingDashboardHref, isStagingRailwayHostname } from "../src/utils/dashboardLink";

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

test("staging marketing navigation opens the local dashboard without redirecting to production", () => {
  assert.equal(isStagingRailwayHostname("tgreposter-staging-production.up.railway.app"), true);
  assert.equal(getMarketingDashboardHref("tgreposter-staging-production.up.railway.app"), "/dashboard/");
  assert.equal(getMarketingDashboardHref("preview-123.vercel.app"), "/dashboard/");
  assert.equal(getMarketingDashboardHref("localhost"), "/dashboard/");
  assert.equal(getMarketingDashboardHref("www.tgreposter.com"), "https://api.tgreposter.com/");
  assert.equal(getMarketingDashboardHref("tgreposter.com"), "https://api.tgreposter.com/");
  assert.equal(getMarketingDashboardHref("api.tgreposter.com"), "https://api.tgreposter.com/");
  assert.equal(getMarketingDashboardHref("tgreposter-staging-production.up.railway.app.evil.test"), "https://api.tgreposter.com/");

  const main = readFileSync(resolve(root, "src/main.tsx"), "utf8");
  const home = readFileSync(resolve(root, "src/MarketingHome.tsx"), "utf8");
  assert.match(main, /isStagingRailwayHostname\(hostname\)/);
  assert.match(main, /isStagingRailwayDashboard/);
  assert.match(home, /const dashboardUrl = getMarketingDashboardHref\(window.location.hostname\)/);
  assert.equal((home.match(/href=\{dashboardUrl\}/g) ?? []).length, 3);
});
