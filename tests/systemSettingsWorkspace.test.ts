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

test("System Settings explains the fully personal application-data boundary", () => {
  assert.match(systemSource, /System Architecture & Health/);
  assert.match(systemSource, /Personal Monitoring Data/);
  assert.match(systemSource, /Personal Workspace Data/);
  assert.match(systemSource, /Runtime Data Boundaries/);
  assert.match(systemSource, /Workspace Isolation Checks/);
  assert.match(systemSource, /System administration scope/);
  assert.doesNotMatch(systemSource, /Shared Platform Data/);
});

test("System Settings recognizes user-owned destination and inbox tables", () => {
  assert.match(healthSource, /"destination_targets"/);
  assert.match(healthSource, /"user_inbox_items"/);
  assert.match(healthSource, /destinationOwnershipReady/);
  assert.match(healthSource, /applicationOwnershipReady/);
  assert.match(healthSource, /inboxIsolationReady/);
  assert.match(healthSource, /unownedApplicationRows/);
  assert.match(healthSource, /count\(distinct owner_principal\)/);
});

test("System Settings counts published state from the user inbox after cutover", () => {
  assert.match(
    healthSource,
    /count\(\*\) filter \(where status = 'posted'\).*posted_posts/s
  );
  assert.match(healthSource, /from public\.user_inbox_items/);
});

test("platform health endpoint is restricted to super-admins", () => {
  assert.match(
    serverSource,
    /app\.get\("\/api\/supabase\/status", authMiddleware, requireSuperAdmin/
  );
});

test("System Settings never presents personal bot credentials as global config", () => {
  assert.match(systemSource, /Credentials[\s\S]*remain managed from each member/);
  assert.match(systemSource, /user-scoped Vault secrets/);
  assert.doesNotMatch(systemSource, /Telegram Bot Token Configuration/);
});
