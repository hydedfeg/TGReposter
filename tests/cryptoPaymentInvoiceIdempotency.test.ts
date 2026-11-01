import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    "supabase/migrations/20261006133316_add_crypto_payment_invoice_idempotency.sql"
  ),
  "utf8"
);

test("payment invoices preserve nominal amount and owner-scoped idempotency", () => {
  assert.match(
    migration,
    /add column if not exists requested_amount numeric\(36, 18\)/i
  );
  assert.match(
    migration,
    /add column if not exists request_key text/i
  );
  assert.match(
    migration,
    /unique index if not exists crypto_payment_invoices_owner_request_key_idx[\s\S]*?\(owner_principal, request_key\)/i
  );
  assert.match(
    migration,
    /request_key is null or char_length\(btrim\(request_key\)\) between 8 and 128/i
  );
});
