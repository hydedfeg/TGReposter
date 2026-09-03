import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const systemSource = fs.readFileSync(
  path.join(repoRoot, "src/components/DatabaseConfig.tsx"),
  "utf8"
);
const healthSource = fs.readFileSync(
  path.join(repoRoot, "server/services/databaseHealthService.ts"),
  "utf8"
);
const serverSource = fs.readFileSync(path.join(repoRoot, "server.ts"), "utf8");

test("System Settings is infrastructure-only and rejects shared application data language", () => {
  assert.match(systemSource, /Infrastructure & Isolation Health/);
  assert.match(systemSource, /no shared user application configuration/i);
  assert.match(systemSource, /Per-user Ownership Check/);
  assert.match(systemSource, /Internal System Storage/);
  assert.match(systemSource, /No shared application data/);
  assert.doesNotMatch(systemSource, /Shared Platform Data/);
  assert.doesNotMatch(systemSource, /Shared Sources/);
  assert.doesNotMatch(systemSource, /Shared Filters/);
  assert.doesNotMatch(systemSource, /Shared AI Settings/);
});

test("System health verifies ownership for every user application domain", () => {
  for (const table of [
    "source_channels",
    "filters",
    "destination_targets",
    "ai_settings",
    "user_inbox_items",
    "telegram_bot_accounts",
    "promotion_targets",
    "promotion_campaigns",
    "promotion_campaign_posts",
    "promotion_deliveries",
    "promotion_delivery_attempts",
  ]) {
    assert.match(healthSource, new RegExp(`"${table}"`));
  }
  assert.match(healthSource, /owner_principal/);
  assert.match(healthSource, /orphanRows/);
});

test("System Settings does not expose cross-user application record counts", () => {
  assert.doesNotMatch(systemSource, /Destination Targets/);
  assert.doesNotMatch(systemSource, /Inbox Workflow Rows/);
  assert.doesNotMatch(systemSource, /Published Workflow/);
  assert.doesNotMatch(systemSource, /Source Channels/);
  assert.doesNotMatch(healthSource, /destinationOwners/);
  assert.doesNotMatch(healthSource, /inboxOwners/);
});

test("platform health endpoint is restricted to super-admins", () => {
  assert.match(
    serverSource,
    /app\.get\("\/api\/supabase\/status", authMiddleware, requireSuperAdmin/
  );
});

test("internal ingestion cache is not treated as user-visible shared content", () => {
  assert.match(systemSource, /Internal Ingestion Cache/);
  assert.match(systemSource, /invisible to a user until that user/);
  assert.match(systemSource, /own source/);
});
