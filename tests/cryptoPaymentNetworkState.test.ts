import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    "supabase/migrations/20261004184225_create_crypto_payment_network_state.sql"
  ),
  "utf8"
);

test("network scanner state is backend-only and keyed by payment identity", () => {
  assert.match(
    migration,
    /primary key \(network, token_identifier, receiving_address\)/i
  );
  assert.match(
    migration,
    /alter table public\.crypto_payment_network_state enable row level security;/i
  );
  assert.match(
    migration,
    /revoke all on table public\.crypto_payment_network_state from anon, authenticated;/i
  );
  assert.doesNotMatch(
    migration,
    /private_key|seed_phrase|mnemonic|wallet_password/i
  );
});
