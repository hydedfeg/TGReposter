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
  });

  assert.equal(queries.length, 5);
  assert.equal(output.summary.paid, 1);
  assert.deepEqual(output.networkStates, []);
  assert.deepEqual(output.invoices, []);
  assert.deepEqual(output.transactions, []);
  assert.deepEqual(output.events, []);

  for (const sql of queries) {
    assert.match(sql, /^\s*select\s/i);
    assert.doesNotMatch(sql, /select\s+\*/i);
    assert.doesNotMatch(sql, /private_key|seed_phrase|rpc_url|api_key|credential/i);
  }

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
