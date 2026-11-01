import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    "supabase/migrations/20261004191015_create_crypto_payment_amount_reservations.sql"
  ),
  "utf8"
);

test("payment amount reservations are backend-only and collision-safe", () => {
  assert.match(
    migration,
    /primary key \(network, receiving_address, token_identifier, expected_amount\)/i
  );
  assert.match(
    migration,
    /unique \(owner_principal, invoice_id\)/i
  );
  assert.match(
    migration,
    /foreign key \(owner_principal, invoice_id\)[\s\S]*?crypto_payment_invoices/i
  );
  assert.match(
    migration,
    /alter table public\.crypto_payment_amount_reservations enable row level security;/i
  );
  assert.match(
    migration,
    /revoke all on table public\.crypto_payment_amount_reservations from anon, authenticated;/i
  );
  assert.doesNotMatch(
    migration,
    /private_key|seed_phrase|mnemonic|wallet_password/i
  );
});
