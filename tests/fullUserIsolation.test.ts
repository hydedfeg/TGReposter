import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const server = read("server.ts");
const settingsRepository = read("server/repositories/settingsRepository.ts");
const workspaceRepository = read("server/repositories/userWorkspaceRepository.ts");
const inboxRepository = read("server/repositories/userInboxRepository.ts");
const promotionRoute = read("server/routes/promotion.ts");
const promotionRepository = read("server/repositories/promotionRepository.ts");
const ownedCampaignRepository = read(
  "server/repositories/ownedPromotionCampaignRepository.ts"
);
const prepareMigration = read(
  "supabase/migrations/20260903123000_scope_all_application_data_by_user.sql"
);
const finalizeMigration = read(
  "supabase/migrations/20260903124500_finalize_full_user_isolation.sql"
);
const app = read("src/App.tsx");
const shell = read("src/components/AppShell.tsx");

test("all user application configuration is owner-scoped", () => {
  for (const table of [
    "source_channels",
    "filters",
    "ai_settings",
  ]) {
    assert.match(workspaceRepository, new RegExp(`public\\.${table}`));
  }
  assert.match(workspaceRepository, /where owner_principal = \$1/);
  assert.match(workspaceRepository, /on conflict \(owner_principal, username\)/);
  assert.match(workspaceRepository, /on conflict \(owner_principal\) do update/);
});

test("authenticated settings load and save the current user's complete workspace", () => {
  assert.match(server, /getUserWorkspaceConfig\(req\.user\)/);
  assert.match(server, /saveUserChannels\(req\.user, incoming\.channels\)/);
  assert.match(server, /saveUserFilters\(req\.user, incoming\.filters\)/);
  assert.match(server, /saveUserAIConfig\(req\.user, incoming\.aiConfig\)/);
  assert.match(server, /getUserDestinationConfig\(req\.user\)/);
  assert.match(server, /getUserInboxPosts\(req\.user\)/);
});

test("legacy settings repository cannot mutate tenant application data", () => {
  assert.doesNotMatch(settingsRepository, /delete from public\.source_channels/);
  assert.doesNotMatch(settingsRepository, /insert into public\.source_channels/);
  assert.doesNotMatch(settingsRepository, /delete from public\.filters/);
  assert.doesNotMatch(settingsRepository, /insert into public\.filters/);
  assert.doesNotMatch(settingsRepository, /delete from public\.ai_settings/);
  assert.doesNotMatch(settingsRepository, /insert into public\.ai_settings/);
  assert.doesNotMatch(settingsRepository, /insert into public\.destination_targets/);
  assert.doesNotMatch(settingsRepository, /insert into public\.posts/);
});

test("a user sees only explicitly assigned Content Inbox items", () => {
  assert.match(inboxRepository, /from public\.user_inbox_items ui\s+join public\.posts p/s);
  assert.match(inboxRepository, /where ui\.owner_principal = \$1/);
  assert.doesNotMatch(
    inboxRepository,
    /from public\.posts p\s+left join public\.user_inbox_items ui/s
  );
  assert.match(server, /ensureInboxPostsForOwner/);
  assert.match(server, /Source channel does not belong to this workspace/);
});

test("AI curation uses the signed-in user's AI configuration", () => {
  assert.match(server, /const workspace = await getUserWorkspaceConfig\(req\.user\)/);
  assert.match(server, /aiProvider = workspace\.aiConfig\.provider/);
  assert.match(server, /aiModel = workspace\.aiConfig\.model/);
});

test("promotion bots, targets, campaigns, and source posts are owner-scoped", () => {
  assert.match(promotionRoute, /ownerPrincipalForUser\(req\.user\)/);
  assert.match(promotionRoute, /new PromotionRepository\(ownerPrincipal\)/);
  assert.match(
    promotionRoute,
    /new OwnedPromotionCampaignRepository\(ownerPrincipal\)/
  );
  assert.match(promotionRepository, /where owner_principal = \$1/);
  assert.match(ownedCampaignRepository, /where owner_principal = \$1/);
  assert.match(
    ownedCampaignRepository,
    /from public\.user_inbox_items ui\s+join public\.posts p/s
  );
});

test("migration tenant-scopes every application table and finalizes without orphans", () => {
  for (const table of [
    "source_channels",
    "filters",
    "ai_settings",
    "destination_targets",
    "telegram_bot_accounts",
    "promotion_targets",
    "promotion_campaigns",
    "promotion_campaign_posts",
    "promotion_deliveries",
    "promotion_delivery_attempts",
  ]) {
    assert.match(
      prepareMigration + finalizeMigration,
      new RegExp(`public\\.${table}`)
    );
  }
  assert.match(prepareMigration, /owner_principal/);
  assert.match(finalizeMigration, /alter column owner_principal set not null/);
  assert.match(finalizeMigration, /drop constraint if exists source_channels_username_key/);
  assert.match(
    finalizeMigration,
    /drop constraint if exists telegram_bot_accounts_credential_ref_key/
  );
});

test("regular admins can open and render their own Sources Filters and AI configuration", () => {
  assert.match(
    app,
    /const superAdminViews = new Set<WorkspaceView>\(\["team", "database"\]\)/
  );
  assert.match(app, /activeWorkspaceTab === "channels" \? \(/);
  assert.match(app, /activeWorkspaceTab === "filters" \? \(/);
  assert.match(app, /activeWorkspaceTab === "ai" \? \(/);
  assert.match(shell, /label: "My Sources"/);
  assert.match(shell, /label: "My Filters"/);
  assert.match(shell, /label: "My AI Configuration"/);
});
