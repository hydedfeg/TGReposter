import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Read-only, offline acceptance of the three historically non-whitespace SQL
 * mismatches. The comparison strips SQL '--' comments and whitespace for
 * THESE REVIEWED FILES ONLY. It is not a general SQL semantic parser.
 *
 * Anchors were measured by read-only SQL against staging on 2026-10-27.
 * Never connect to the live database from CI or replay its repair migrations.
 */
const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const normalize = (sql: string) =>
  sql.replace(/--[^\r\n]*/g, "").replace(/\s+/g, "");
const md5 = (s: string) => createHash("md5").update(s, "utf8").digest("hex");
const normalizeHash = (s: string) => md5(normalize(s));
const baseline = JSON.parse(read("docs/staging-restore-provenance-baseline.json"));
const originalHashes: Record<string, string> = {
  initial_schema: "89c1bfddccb5aecd3fac7ffba97da279",
  repair_missing_curator_settings_baseline: "4374b2dea4a8f43b702fce144d4bb626",
  repair_missing_pg_cron_baseline: "6b9f2c132e9860d5e04a7f0eb2d50890",
  persist_user_ui_locale: "90cdb8d5fd23c5184d01706e67b52dd1",
  allow_zero_value_crypto_unassigned_observations: "d507bec4e45bb4cb86a1befe599e5817"
};
const appliedNormalizedHashes: Record<string, string> = {
  initial_schema: "dc33311976e3c0d0586757b50393b0cb",
  repair_missing_curator_settings_baseline: "5c1e3a273ecca1f15878c44da9da7f35",
  repair_missing_pg_cron_baseline: "2fd06845ccedbcbd1dc41801ded3a452",
  persist_user_ui_locale: "2fa01506f6691ccd3699d1ca66a0f38d",
  allow_zero_value_crypto_unassigned_observations: "ab0ad37735c6d40b1a21b6b0f08d4289"
};
const initial = read("supabase/migrations/001_initial_schema.sql");
const extract = (source: string, start: string, finish: string): string => {
  const from = source.indexOf(start);
  assert.ok(from >= 0, "Expected reviewed SQL segment start was removed");
  const stop = source.indexOf(finish, from);
  assert.ok(stop >= from, "Expected reviewed SQL segment end was removed");
  assert.equal(source.indexOf(start, from + start.length), -1,
    "Unexpected duplicate reviewed SQL segment");
  return source.slice(from, stop + finish.length);
};
const cronRepair = extract(initial,
  "create extension if not exists pg_cron with schema pg_catalog;",
  "grant all privileges on all tables in schema cron to postgres;");
const curatorRepair = extract(initial,
  "create table if not exists public.curator_settings (",
  "on conflict (id) do nothing;");

test("archived staging ledger anchors preserve all five applied SQL statement hashes", () => {
  assert.equal(baseline.sourceProjectRef, "msmfilgdwuoymjhgtrmy");
  for (const [name, expected] of Object.entries(originalHashes)) {
    const entry = baseline.payload.migrationLedger.find(
      (x: {name: string}) => x.name === name);
    assert.ok(entry, "Missing historical staging entry: " + name);
    assert.equal(entry.firstStatementMd5, expected,
      "Historical staging SQL was silently rewritten: " + name);
  }
});

test("UI locale and zero-value transfer SQL differ only in comments/formatting", () => {
  const cases = [
    ["persist_user_ui_locale", "supabase/migrations/20260929161219_persist_user_ui_locale.sql"],
    ["allow_zero_value_crypto_unassigned_observations",
      "supabase/migrations/20261012135929_allow_zero_value_crypto_unassigned_observations.sql"]
  ] as const;
  for (const [name, file] of cases) {
    assert.equal(normalizeHash(read(file)), appliedNormalizedHashes[name],
      "Executable SQL changed unexpectedly: " + name);
  }
});

test("repaired pg_cron and curator_settings sections match separately applied staging repairs", () => {
  assert.equal(normalizeHash(cronRepair),
    appliedNormalizedHashes.repair_missing_pg_cron_baseline);
  assert.equal(normalizeHash(curatorRepair),
    appliedNormalizedHashes.repair_missing_curator_settings_baseline);
});

test("removing exactly the two separately applied repairs restores initial_schema parity", () => {
  const full = normalize(initial);
  const cron = normalize(cronRepair), curator = normalize(curatorRepair);
  assert.equal(full.split(cron).length, 2, "pg_cron repair appeared unexpectedly");
  assert.equal(full.split(curator).length, 2, "curator_settings repair appeared unexpectedly");
  assert.equal(md5(full.replace(cron, "").replace(curator, "")),
    appliedNormalizedHashes.initial_schema,
    "Source initial_schema changed beyond the two reviewed repair additions");
});
