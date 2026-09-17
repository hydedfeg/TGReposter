import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath: string) =>
  fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const serverSource = read("server.ts");
const settingsRepositorySource = read("server/repositories/settingsRepository.ts");
const channelRepositorySource = read("server/repositories/channelRepository.ts");
const postRepositorySource = read("server/repositories/postRepository.ts");
const appSource = read("src/App.tsx");
const shellSource = read("src/components/AppShell.tsx");
const loginSource = read("src/components/Login.tsx");
const migrationSource = read(
  "supabase/migrations/20260905133955_finalize_personal_reposting_runtime.sql"
);
const environmentCronMigrationSource = read(
  "supabase/migrations/20260915125102_configure_environment_specific_inbox_cron_url.sql"
);

test("monitoring repositories require an owner for every application read and write", () => {
  assert.match(channelRepositorySource, /where owner_principal = \$1/);
  assert.match(channelRepositorySource, /on conflict \(owner_principal, username\)/);
  assert.match(channelRepositorySource, /listOwnersWithEnabledChannels/);

  assert.match(postRepositorySource, /\(owner_principal, id,/);
  assert.match(postRepositorySource, /on conflict \(owner_principal, id\)/);
  assert.match(postRepositorySource, /where owner_principal = \$1/);

  for (const table of ["source_channels", "filters", "ai_settings", "destination_targets", "posts"]) {
    assert.match(
      settingsRepositorySource,
      new RegExp(`from public\\.${table}[\\s\\S]*?where owner_principal = \\$1`)
    );
  }
  assert.match(settingsRepositorySource, /Ownerless reads support authentication and system administration only/);
  assert.match(settingsRepositorySource, /Application configuration and content must always use/);
});

test("manual and scheduled collection execute inside one explicit owner workspace", () => {
  assert.match(serverSource, /collectPostsForOwner\([\s\S]*?ownerPrincipal: string \| null/);
  assert.match(serverSource, /ownerPrincipalForUser\(req\.user\)/);
  assert.match(serverSource, /listOwnersWithEnabledChannels\(\)/);
  assert.match(serverSource, /collectPostsForOwner\(ownerPrincipal, null\)/);
  assert.match(serverSource, /postService\.savePosts\(ownerPrincipal, postEntities\)/);
  assert.match(serverSource, /getOwnerInboxPosts\(ownerPrincipal, 400\)/);
  assert.doesNotMatch(serverSource, /username: "system:cron"/);
});

test("all authenticated users can manage their private monitoring configuration", () => {
  assert.match(serverSource, /app\.use\("\/api\/channels", authMiddleware, channelRoutes\)/);
  assert.doesNotMatch(
    serverSource,
    /Admins can edit posts and manage only their own Telegram destinations/
  );
  assert.match(appSource, /new Set<WorkspaceView>\(\["team", "database"\]\)/);
  assert.match(appSource, /activeWorkspaceTab === "channels" \?/);
  assert.match(appSource, /activeWorkspaceTab === "filters" \?/);
  assert.match(appSource, /activeWorkspaceTab === "ai" \?/);
  assert.match(shellSource, /const personalItems[\s\S]*view: "channels"[\s\S]*view: "filters"[\s\S]*view: "destination"[\s\S]*view: "ai"/);
});

test("browser fallback data is partitioned by the immutable account principal", () => {
  assert.match(serverSource, /accountKey: session \? ownerPrincipalForUser\(session\) : null/);
  assert.match(appSource, /localStorage\.getItem\("curator_account_key"\)/);
  assert.match(appSource, /telegram-curator-settings:\$\{accountKey/);
  assert.match(loginSource, /data\.accountKey/);
  assert.doesNotMatch(appSource, /telegram-curator-settings:\$\{username/);
});

test("finalize migration eliminates shared application identifiers and orphan rows", () => {
  assert.match(migrationSource, /add constraint posts_pkey primary key \(owner_principal, id\)/);
  assert.match(migrationSource, /drop constraint if exists source_channels_username_key/);
  assert.match(migrationSource, /drop index if exists public\.destination_targets_client_id_key/);

  for (const table of ["source_channels", "filters", "ai_settings", "destination_targets"]) {
    assert.match(
      migrationSource,
      new RegExp(`alter table public\\.${table}[\\s\\S]*?alter column owner_principal set not null`)
    );
  }

  assert.match(migrationSource, /foreign key \(owner_principal, post_id\)/);
  assert.match(migrationSource, /campaign_post\.owner_principal = p\.owner_principal/);
  assert.match(migrationSource, /ui\.owner_principal = p\.owner_principal/);
});

test("scheduled collection resolves its application URL per environment", () => {
  assert.match(environmentCronMigrationSource, /where name = 'tgreposter_app_url'/);
  assert.match(environmentCronMigrationSource, /nullif\(rtrim\(btrim\(decrypted_secret\), '\/'\), ''\)/);
  assert.match(environmentCronMigrationSource, /'https:\/\/api\.tgreposter\.com'/);
  assert.match(environmentCronMigrationSource, /\|\| '\/api\/fetch-posts'/);
  assert.match(environmentCronMigrationSource, /where name = 'tgreposter_cron_secret'/);
  assert.doesNotMatch(environmentCronMigrationSource, /tgreposter-staging-production/);
});

test("hourly cleanup preserves history within the matching owner workspace", () => {
  assert.match(migrationSource, /'tgreposter-inbox-cleanup',[\s\S]*?'0 \* \* \* \*'/);
  assert.match(migrationSource, /now\(\) - interval '24 hours'/);
  assert.match(migrationSource, /ui\.owner_principal = p\.owner_principal/);
  assert.match(migrationSource, /ui\.post_id = p\.id/);
  assert.match(migrationSource, /ui\.status in \('approved', 'posted'\)/);
  assert.match(migrationSource, /campaign_post\.owner_principal = p\.owner_principal/);
  assert.match(migrationSource, /campaign_post\.post_id = p\.id/);
});
