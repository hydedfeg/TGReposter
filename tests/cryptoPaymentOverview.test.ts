import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCryptoPaymentOverview } from "../server/payments/paymentOverview";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("super-admin overview is bounded, read-only, and does not select payment secrets", async () => {
  const queries: string[] = [];
  const output = await loadCryptoPaymentOverview(async (sql) => {
    queries.push(sql);
    if (sql.includes("count(*)::int as total")) {
      return { rows: [{ total: 2, paid: 1, active: 1, attention: 0 }] };
    }
    return { rows: [] };
  }, {});

  assert.equal(queries.length, 6);
  assert.equal(output.summary.paid, 1);
  assert.deepEqual(output.networkStates, []);
  assert.equal(output.networkHealth.networks.length, 3);
  assert.ok(output.networkHealth.networks.every(network => network.state === "disabled"));
  assert.deepEqual(output.invoices, []);
  assert.deepEqual(output.transactions, []);
  assert.deepEqual(output.events, []);
  assert.deepEqual(output.reconciliation.alerts, []);
  assert.equal(output.reconciliation.truncated, false);
  assert.equal(output.reconciliation.includesUnmatchedOnChainTransfers, false);

  for (const sql of queries) {
    assert.match(sql, /^\s*(?:select|with)\s/i);
    assert.doesNotMatch(sql, /select\s+\*/i);
    assert.doesNotMatch(sql, /private_key|seed_phrase|rpc_url|api_key|credential/i);
  }

  assert.ok(queries.some(sql => /limit 31/i.test(sql)));
  assert.ok(queries.some(sql => /limit 50/i.test(sql)));
  assert.ok(queries.filter(sql => /limit 30/i.test(sql)).length === 2);
  assert.ok(queries.some(sql => /owner_principal/i.test(sql)));
});

test("payments overview endpoint is behind super-admin authorization", () => {
  const route = readFileSync(resolve(root, "server/routes/cryptoPayments.ts"), "utf8");
  const authPosition = route.indexOf("router.use(requireSuperAdmin);");
  const overviewPosition = route.indexOf('router.get("/overview"');
  assert.ok(authPosition >= 0);
  assert.ok(overviewPosition > authPosition);
  assert.match(route, /loadCryptoPaymentOverview\(\)/);
  assert.doesNotMatch(route.slice(overviewPosition, route.indexOf('router.post("/preflight"')), /req\.query|req\.body/);
});

test("payments workspace is only mounted for super-admins and has a navigation item", () => {
  const app = readFileSync(resolve(root, "src/App.tsx"), "utf8");
  const shell = readFileSync(resolve(root, "src/components/AppShell.tsx"), "utf8");
  assert.match(app, /new Set<WorkspaceView>\(\["team", "database", "payments"\]\)/);
  assert.match(app, /activeWorkspaceTab === "payments" && currentUserRole === "super-admin"/);
  assert.match(shell, /view: "payments", labelKey: "items\.payments"/);
  assert.match(shell, /currentUserRole === "super-admin"/);
});

test("network health recognizes recent, stale and missing checkpoints without revealing wallet identity", async () => {
  const { assessCryptoPaymentNetworkHealth } = await import("../server/payments/paymentHealth");
  const env = {
    CRYPTO_PAYMENTS_ENABLED: "true",
    CRYPTO_PAYMENT_SCAN_INTERVAL_MS: "60000",
    CRYPTO_USDT_BSC_ENABLED: "true",
    CRYPTO_USDT_BSC_RPC_URL: "https://rpc.example",
    CRYPTO_USDT_BSC_RECEIVING_ADDRESS: "0x2222222222222222222222222222222222222222",
    CRYPTO_USDT_BSC_CONFIRMATIONS: "120",
    CRYPTO_USDT_ETHEREUM_ENABLED: "true",
    CRYPTO_USDT_ETHEREUM_RPC_URL: "https://rpc.example",
    CRYPTO_USDT_ETHEREUM_RECEIVING_ADDRESS: "0x2222222222222222222222222222222222222222",
    CRYPTO_USDT_ETHEREUM_CONFIRMATIONS: "80",
  };
  const now = new Date("2026-10-10T15:00:00.000Z");
  const states = [
    {
      network: "bsc" as const,
      receiving_address: "0x2222222222222222222222222222222222222222",
      token_identifier: "0x55d398326f99059ff775485246999027b3197955",
      last_scanned_at: "2026-10-10T14:59:30Z",
    },
    {
      network: "ethereum" as const,
      receiving_address: "0x2222222222222222222222222222222222222222",
      token_identifier: "0xdac17f958d2ee523a2206206994597c13d831ec7",
      last_scanned_at: "2026-10-10T14:55:00Z",
    },
  ];

  const assessment = assessCryptoPaymentNetworkHealth(states, env, now);
  assert.equal(assessment.staleAfterSeconds, 180);
  assert.deepEqual(assessment.networks.map(item => item.state), ["recent", "stale", "disabled"]);
  assert.equal(assessment.networks[0].ageSeconds, 30);
  assert.equal(assessment.networks[1].ageSeconds, 300);
  assert.ok(!JSON.stringify(assessment).includes("2222222222222222222222222222222222222222"));

  const noCurrentWallet = assessCryptoPaymentNetworkHealth(
    [{ ...states[0], receiving_address: "0x3333333333333333333333333333333333333333" }],
    { ...env, CRYPTO_USDT_ETHEREUM_ENABLED: "false" },
    now
  );
  assert.equal(noCurrentWallet.networks[0].state, "never_scanned");
});

test("disabled scanner ignores old records; invalid scan timestamps are not healthy", async () => {
  const { assessCryptoPaymentNetworkHealth } = await import("../server/payments/paymentHealth");
  const row = {
    network: "ton" as const,
    receiving_address: "UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c",
    token_identifier: "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs",
    last_scanned_at: "not-a-timestamp",
  };
  const disabled = assessCryptoPaymentNetworkHealth([row], {}, new Date("2026-10-10T15:00:00Z"));
  assert.equal(disabled.networks[2].state, "disabled");
  const env = {
    CRYPTO_PAYMENTS_ENABLED: "true",
    CRYPTO_USDT_TON_ENABLED: "true",
    CRYPTO_USDT_TON_RPC_URL: "https://toncenter.com",
    CRYPTO_USDT_TON_RECEIVING_ADDRESS: row.receiving_address,
    CRYPTO_USDT_TON_CONFIRMATIONS: "1",
  };
  const enabled = assessCryptoPaymentNetworkHealth([row], env, new Date("2026-10-10T15:00:00Z"));
  assert.equal(enabled.networks[2].state, "never_scanned");
});

test("reconciliation returns bounded, owner-attributed exceptions and scanner warnings", async () => {
  const env = {
    CRYPTO_PAYMENTS_ENABLED: "true",
    CRYPTO_PAYMENT_SCAN_INTERVAL_MS: "60000",
    CRYPTO_USDT_BSC_ENABLED: "true",
    CRYPTO_USDT_BSC_RPC_URL: "https://rpc.example",
    CRYPTO_USDT_BSC_RECEIVING_ADDRESS: "0x2222222222222222222222222222222222222222",
    CRYPTO_USDT_BSC_CONFIRMATIONS: "120",
  };
  const now = new Date("2026-10-10T15:00:00Z");
  const alertRow = {
    code: "paid_without_confirmed_transfer",
    invoice_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    owner_principal: "supabase:owner-one",
    network: "bsc",
    occurred_at: "2026-10-10T14:00:00Z",
  };
  const result = await loadCryptoPaymentOverview(async (sql) => {
    if (sql.includes("count(*)::int as total")) {
      return { rows: [{ total: 1, paid: 1, active: 0, attention: 0 }] };
    }
    if (sql.includes("from public.crypto_payment_network_state")) {
      return { rows: [{
        network: "bsc",
        receiving_address: "0x2222222222222222222222222222222222222222",
        token_identifier: "0x55d398326f99059ff775485246999027b3197955",
        last_scanned_at: "2026-10-10T14:54:00Z",
      }] };
    }
    if (sql.includes("with issues as")) return { rows: [alertRow] };
    return { rows: [] };
  }, env, now);

  assert.equal(result.reconciliation.alerts.length, 2);
  assert.equal(result.reconciliation.alerts[0].code, "scanner_delayed");
  assert.equal(result.reconciliation.alerts[1].code, "paid_without_confirmed_transfer");
  assert.equal(result.reconciliation.alerts[1].severity, "critical");
  assert.equal(result.reconciliation.alerts[1].ownerPrincipal, "supabase:owner-one");
  const response = JSON.stringify(result);
  assert.doesNotMatch(response, /rpc.example/);
  assert.doesNotMatch(response, /2222222222222222222222222222222222222222/);
});

test("reconciliation reports truncated results rather than silently claiming completeness", async () => {
  const result = await loadCryptoPaymentOverview(async (sql) => {
    if (sql.includes("with issues as")) return {
      rows: Array.from({ length: 31 }, (_, n) => ({
        code: "invoice_exception",
        invoice_id: String(n),
        network: "ethereum",
        owner_principal: "supabase:owner-two",
        occurred_at: "2026-10-10T14:00:00Z",
      })),
    };
    return { rows: [] };
  }, {});
  assert.equal(result.reconciliation.alerts.length, 30);
  assert.equal(result.reconciliation.truncated, true);
});

test("payment operations renders automatic read-only alert reconciliation with bounded poll", () => {
  const source = readFileSync(resolve(root, "src/components/CryptoPayments.tsx"), "utf8");
  assert.match(source, /overview\?\.reconciliation\.alerts/);
  assert.match(source, /document\.visibilityState !== "visible"/);
  assert.match(source, /window\.setInterval\(/);
  assert.match(source, /60_000/);
  assert.match(source, /controller\.abort\(\)/);
  assert.doesNotMatch(source, /localStorage\.setItem\(/);
});
