import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PromotionCampaignError,
  PromotionCampaignService,
} from "../server/services/promotionCampaignService";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath: string) =>
  fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const routeSource = read("server/routes/promotion.ts");
const adminRepositorySource = read("server/repositories/promotionRepository.ts");
const campaignRepositorySource = read("server/repositories/promotionCampaignRepository.ts");
const credentialSource = read("server/services/telegramCredentialService.ts");
const workspaceSource = read("src/components/PromotionWorkspace.tsx");
const migrationSource = read(
  "supabase/migrations/20260905152000_finalize_personal_promotion_runtime.sql"
);

const aliceOwner = "legacy:alice";
const bobOwner = "legacy:bob";

test("promotion routes derive ownership from the authenticated session and do not use role gates", () => {
  assert.match(routeSource, /router\.use\(authMiddleware\)/);
  assert.ok(
    (routeSource.match(/ownerPrincipalForUser\(req\.user\)/g) || []).length >= 17
  );
  assert.doesNotMatch(routeSource, /requireSuperAdmin/);
  assert.match(routeSource, /campaignService\.launchCampaign\(ownerPrincipal/);
  assert.match(routeSource, /aiService\.generate\(ownerPrincipal/);
});

test("promotion repositories scope roots, children, source posts, and delivery joins by owner", () => {
  for (const table of ["telegram_bot_accounts", "promotion_targets"]) {
    assert.match(
      adminRepositorySource,
      new RegExp(`from public\\.${table}[\\s\\S]*?where owner_principal = \\$1`)
    );
  }
  assert.match(adminRepositorySource, /\(owner_principal, name, bot_username/);
  assert.match(adminRepositorySource, /\(owner_principal, bot_account_id, name/);

  for (const table of ["promotion_campaigns", "promotion_campaign_posts", "posts"]) {
    assert.match(
      campaignRepositorySource,
      new RegExp(`from public\\.${table}[\\s\\S]*?owner_principal = \\$1`)
    );
  }
  assert.match(campaignRepositorySource, /cp\.owner_principal = d\.owner_principal/);
  assert.match(campaignRepositorySource, /p\.owner_principal = cp\.owner_principal/);
  assert.match(campaignRepositorySource, /t\.owner_principal = d\.owner_principal/);
  assert.match(campaignRepositorySource, /b\.owner_principal = t\.owner_principal/);
});

test("a campaign ID owned by another user is indistinguishable from a missing campaign", async () => {
  const campaignId = "11111111-1111-4111-8111-111111111111";
  const observedOwners: string[] = [];
  const repository = {
    async getCampaign(ownerPrincipal: string) {
      observedOwners.push(ownerPrincipal);
      return ownerPrincipal === aliceOwner
        ? {
            id: campaignId,
            name: "Alice campaign",
            status: "draft",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        : null;
    },
  } as any;
  const service = new PromotionCampaignService(async () => ({}), repository);

  await assert.rejects(
    service.getCampaignDetail(bobOwner, campaignId),
    (error: any) => {
      assert.ok(error instanceof PromotionCampaignError);
      assert.equal(error.status, 404);
      assert.equal(error.code, "NOT_FOUND");
      return true;
    }
  );
  assert.deepEqual(observedOwners, [bobOwner]);
});

test("personal promotion credentials resolve through the owner's Vault token", () => {
  assert.match(
    credentialSource,
    /ownerPrincipal\s*\?\s*await getUserTelegramBotToken\(ownerPrincipal\)/
  );
  assert.match(workspaceSource, /\/api\/promotion\/bot-accounts\/personal/);
  assert.match(workspaceSource, /Register my Destination Bot/);
  assert.doesNotMatch(workspaceSource, /currentUserRole === "super-admin"/);
  assert.doesNotMatch(workspaceSource, /currentUserRole !== "super-admin"/);
});

test("Vault credential writes serialize without requiring raw table update privileges", () => {
  assert.match(
    credentialSource,
    /select pg_advisory_xact_lock\(hashtextextended\(\$1, 0\)\)/
  );
  assert.match(
    credentialSource,
    /lockVaultSecretMutation\(client, MAIN_BOT_SECRET_NAME\)/
  );
  assert.match(
    credentialSource,
    /lockVaultSecretMutation\(client, secretName\)/
  );
  assert.doesNotMatch(
    credentialSource,
    /from vault\.secrets[\s\S]{0,160}for update/
  );
});

test("promotion finalization makes ownership mandatory and rejects cross-owner relationships", () => {
  const tables = [
    "telegram_bot_accounts",
    "promotion_targets",
    "promotion_campaigns",
    "promotion_campaign_posts",
    "promotion_deliveries",
    "promotion_delivery_attempts",
  ];

  for (const table of tables) {
    assert.match(
      migrationSource,
      new RegExp(`alter table public\\.${table}[\\s\\S]*?alter column owner_principal set not null`)
    );
  }

  assert.match(migrationSource, /drop constraint if exists telegram_bot_accounts_credential_ref_key/);
  assert.match(migrationSource, /promotion_targets_owner_bot_account_fkey[\s\S]*?foreign key \(owner_principal, bot_account_id\)/);
  assert.match(migrationSource, /promotion_campaign_posts_owner_campaign_fkey[\s\S]*?foreign key \(owner_principal, campaign_id\)/);
  assert.match(migrationSource, /promotion_deliveries_owner_target_fkey[\s\S]*?foreign key \(owner_principal, target_id\)/);
  assert.match(migrationSource, /promotion_delivery_attempts_owner_delivery_fkey[\s\S]*?foreign key \(owner_principal, delivery_id\)/);
});
