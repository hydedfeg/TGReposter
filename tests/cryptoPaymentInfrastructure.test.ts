import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCryptoPaymentNetworkConfigs } from "../server/payments/paymentConfig";
import { CryptoPaymentNetworkRegistry } from "../server/payments/networkRegistry";
import {
  assertCryptoInvoiceTransition,
  canTransitionCryptoInvoice,
} from "../server/payments/paymentState";
import type { CryptoPaymentNetworkAdapter } from "../server/payments/types";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    "supabase/migrations/20261004184500_create_crypto_payment_infrastructure.sql"
  ),
  "utf8"
);

test("crypto payments remain disabled unless explicitly enabled", () => {
  assert.deepEqual(loadCryptoPaymentNetworkConfigs({}), []);
  assert.deepEqual(
    loadCryptoPaymentNetworkConfigs({
      CRYPTO_PAYMENTS_ENABLED: "true",
    }),
    []
  );
});

test("enabled USDT networks require complete server-side configuration", () => {
  assert.throws(
    () =>
      loadCryptoPaymentNetworkConfigs({
        CRYPTO_PAYMENTS_ENABLED: "true",
        CRYPTO_USDT_BSC_ENABLED: "true",
      }),
    /CRYPTO_USDT_BSC_RPC_URL is missing/
  );

  const configs = loadCryptoPaymentNetworkConfigs({
    CRYPTO_PAYMENTS_ENABLED: "true",
    CRYPTO_USDT_BSC_ENABLED: "true",
    CRYPTO_USDT_BSC_RPC_URL: "https://rpc.example.test",
    CRYPTO_USDT_BSC_RECEIVING_ADDRESS: "0xmerchant",
    CRYPTO_USDT_BSC_TOKEN_IDENTIFIER: "0xtoken",
    CRYPTO_USDT_BSC_CONFIRMATIONS: "4",
  });

  assert.deepEqual(configs, [
    {
      id: "bsc",
      family: "evm",
      asset: "USDT",
      enabled: true,
      rpcUrl: "https://rpc.example.test",
      receivingAddress: "0xmerchant",
      tokenIdentifier: "0xtoken",
      requiredConfirmations: 4,
    },
  ]);
});

test("crypto network registry rejects duplicate chain adapters", () => {
  const registry = new CryptoPaymentNetworkRegistry();
  const adapter: CryptoPaymentNetworkAdapter = {
    network: "bsc",
    async scanTransfers() {
      return [];
    },
  };

  registry.register(adapter);
  assert.equal(registry.get("bsc"), adapter);
  assert.deepEqual(registry.list(), ["bsc"]);
  assert.throws(() => registry.register(adapter), /already registered/);
});

test("invoice state machine prevents terminal-state re-crediting", () => {
  assert.equal(canTransitionCryptoInvoice("pending", "detected"), true);
  assert.equal(canTransitionCryptoInvoice("detected", "confirming"), true);
  assert.equal(canTransitionCryptoInvoice("confirming", "paid"), true);
  assert.equal(canTransitionCryptoInvoice("paid", "paid"), true);
  assert.equal(canTransitionCryptoInvoice("paid", "confirming"), false);
  assert.throws(
    () => assertCryptoInvoiceTransition("paid", "pending"),
    /Invalid crypto payment invoice transition/
  );
});

test("payment ledger is backend-owned and idempotent", () => {
  for (const table of [
    "crypto_payment_invoices",
    "crypto_payment_transactions",
    "crypto_payment_events",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `alter table public\\.${table} enable row level security;`,
        "i"
      )
    );
    assert.match(
      migration,
      new RegExp(
        `revoke all on table public\\.${table} from anon, authenticated;`,
        "i"
      )
    );
  }

  assert.match(
    migration,
    /unique \(network, tx_hash, event_index\)/i
  );
  assert.match(
    migration,
    /foreign key \(owner_principal, invoice_id\)[\s\S]*?crypto_payment_invoices/i
  );

  assert.doesNotMatch(
    migration,
    /^\s*(private_key|seed_phrase|mnemonic|wallet_password)\s+/im
  );
});
