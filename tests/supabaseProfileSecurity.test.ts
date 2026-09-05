import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    "supabase/migrations/20260905125947_restrict_profile_mutations.sql"
  ),
  "utf8"
);

test("profile RBAC fields are backend-owned", () => {
  assert.match(
    migration,
    /drop policy if exists "Users can update own profile" on public\.profiles/i
  );
  assert.match(
    migration,
    /revoke all privileges on table public\.profiles from public, anon, authenticated/i
  );
  assert.match(
    migration,
    /grant select on table public\.profiles to authenticated/i
  );
  assert.doesNotMatch(
    migration,
    /grant[^;]*\b(?:insert|update|delete)\b[^;]*\bto authenticated\b/i
  );
  assert.match(
    migration,
    /grant\s+select\s*,\s*insert\s*,\s*update\s*,\s*delete\s+on\s+table\s+public\.profiles\s+to\s+service_role\s*;/i
  );
});

test("authenticated users can read only their own profile", () => {
  assert.match(
    migration,
    /create policy "Users can read own profile"[\s\S]*for select[\s\S]*to authenticated/i
  );
  assert.match(migration, /\(select auth\.uid\(\)\) = id/i);
});
