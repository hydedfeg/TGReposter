import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    "supabase/migrations/20260903124814_scope_all_application_data_by_user.sql"
  ),
  "utf8"
);

const productionMigrationVersions: Record<string, string> = {
  normalize_runtime_configuration: "20260831153243",
  complete_post_runtime_fields: "20260831153439",
  secure_runtime_and_schedule_inbox: "20260831154334",
  harden_auth_profile_security: "20260901131205",
  move_main_bot_token_to_vault: "20260901132706",
  secure_auth_profile_bootstrap: "20260902150421",
  scope_destinations_by_user: "20260902153812",
  scope_content_inbox_by_user: "20260902185412",
  scope_all_application_data_by_user: "20260903124814",
  restrict_profile_mutations: "20260905125947",
};

// Pin the canonical repository copies. Production omits terminal newlines, and
// the post-field migration's whitespace-only final line is normalized here.
const migrationChecksums: Record<string, string> = {
  normalize_runtime_configuration: "144f95b74e17a56bc0afb0b56bd4f32e",
  complete_post_runtime_fields: "babab9427b991aeeae43a423f4c1b1f6",
  secure_runtime_and_schedule_inbox: "c708b88334543b3ca0d496b5ae2968fd",
  harden_auth_profile_security: "a224f748e13c6388a32b784ee0464f4c",
  move_main_bot_token_to_vault: "a482a804d58ea814eb886f6add42b523",
  secure_auth_profile_bootstrap: "94c789633025736f31fb1d30e8b9a767",
  scope_destinations_by_user: "eca1c68c9ec4819e0e90eb865fff7314",
  scope_content_inbox_by_user: "b18c6b5c2c2620afeb40a32c63d00c6b",
  scope_all_application_data_by_user: "a0f81ca66f59579c26d140af34a5167b",
  restrict_profile_mutations: "ffef95c19d4c86ab7180c0792b94832e",
};

test("source-controlled migration versions match production history", () => {
  const migrationFiles = fs.readdirSync(path.join(repoRoot, "supabase/migrations"));

  for (const [name, version] of Object.entries(productionMigrationVersions)) {
    const matches = migrationFiles.filter((file) => file.endsWith(`_${name}.sql`));
    assert.deepEqual(matches, [`${version}_${name}.sql`]);

    const source = fs.readFileSync(
      path.join(repoRoot, "supabase/migrations", matches[0]),
      "utf8"
    );
    const checksum = crypto.createHash("md5").update(source).digest("hex");
    assert.equal(checksum, migrationChecksums[name]);
  }
});

test("tenant preparation assigns every previously global application table an owner", () => {
  const ownedTables = [
    "source_channels",
    "filters",
    "ai_settings",
    "telegram_bot_accounts",
    "promotion_targets",
    "promotion_campaigns",
    "promotion_campaign_posts",
    "promotion_deliveries",
    "promotion_delivery_attempts",
  ];

  for (const table of ownedTables) {
    assert.match(
      migration,
      new RegExp(
        `alter table public\\.${table} add column if not exists owner_principal text;`,
        "i"
      )
    );
    assert.match(
      migration,
      new RegExp(
        `update public\\.${table} set owner_principal = initial_owner where owner_principal is null;`,
        "i"
      )
    );
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} enable row level security;`, "i")
    );
    assert.match(
      migration,
      new RegExp(
        `revoke all on table public\\.${table} from anon, authenticated;`,
        "i"
      )
    );
  }
});

test("promotion child ownership is derived by private trigger functions", () => {
  const ownerFunctions = [
    "tgreposter_set_promotion_target_owner",
    "tgreposter_set_campaign_post_owner",
    "tgreposter_set_delivery_owner",
    "tgreposter_set_delivery_attempt_owner",
  ];

  for (const functionName of ownerFunctions) {
    assert.match(
      migration,
      new RegExp(
        `create or replace function public\\.${functionName}\\(\\)[\\s\\S]*?security definer[\\s\\S]*?set search_path = pg_catalog, public`,
        "i"
      )
    );
    assert.match(
      migration,
      new RegExp(
        `revoke execute on function public\\.${functionName}\\(\\) from public, anon, authenticated;`,
        "i"
      )
    );
  }
});
