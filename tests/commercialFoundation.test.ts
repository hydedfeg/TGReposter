import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20261010163500_create_commercial_foundation.sql"),
  "utf8"
);

test("commercial foundation creates an unpublished plan catalog and protects all tables", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role;");
    await db.exec(migration);

    const { rows: plans } = await db.query<{
      id: string;
      monthly_eur_cents: number | null;
      annual_eur_cents: number | null;
      monthly_ai_units: string | null;
      is_published: boolean;
    }>(
      "select id, monthly_eur_cents, annual_eur_cents, monthly_ai_units, is_published from public.billing_plans order by sort_order"
    );
    assert.deepEqual(plans.map((p) => p.id), [
      "free", "creator", "professional", "business", "agency", "enterprise",
    ]);
    assert.equal(plans[2].monthly_eur_cents, 3900);
    assert.equal(plans[2].annual_eur_cents, 39000);
    assert.equal(Number(plans[2].monthly_ai_units), 400);
    assert.ok(plans.every((p) => !p.is_published));

    const { rows: statuses } = await db.query<{
      relname: string;
      relrowsecurity: boolean;
      anon_select: boolean;
      authenticated_select: boolean;
    }>(`
      select c.relname, c.relrowsecurity,
        has_table_privilege('anon', c.oid, 'select') as anon_select,
        has_table_privilege('authenticated', c.oid, 'select') as authenticated_select
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public'
        and c.relname in ('billing_plans', 'billing_features', 'billing_plan_features',
          'billing_subscriptions', 'ai_usage_events', 'ai_unit_ledger')
      order by c.relname
    `);
    assert.equal(statuses.length, 6);
    assert.ok(statuses.every((s) => s.relrowsecurity && !s.anon_select && !s.authenticated_select));

    const { rows: subscriptionRows } = await db.query<{ count: number }>(
      "select count(*)::integer as count from public.billing_subscriptions"
    );
    assert.equal(subscriptionRows[0].count, 0);
  } finally {
    await db.close();
  }
});

test("AI ledger enforces owner isolation, idempotency and period-scoped included credits", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role;");
    await db.exec(migration);

    const { rows: usage } = await db.query<{ id: string }>(`
      insert into public.ai_usage_events
      (owner_principal, request_key, operation, model_id, status, units_charged)
      values ('legacy:alice', 'request-alice-1', 'rewrite', 'provider/model', 'success', 2)
      returning id
    `);
    assert.equal(usage.length, 1);

    await assert.rejects(
      db.query(`
        insert into public.ai_usage_events
        (owner_principal, request_key, operation, model_id, status)
        values ('legacy:alice', 'request-alice-1', 'summarize', 'provider/model', 'success')
      `),
      /duplicate key|unique constraint/i
    );

    await db.query(`
      insert into public.ai_unit_ledger
      (owner_principal, event_key, balance_type, event_kind, units_delta, period_start, period_end)
      values ('legacy:alice', 'grant-alice-2026-10', 'included', 'grant', 100,
      '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z')
    `);

    await assert.rejects(
      db.query(`
        insert into public.ai_unit_ledger
        (owner_principal, event_key, balance_type, event_kind, units_delta, usage_event_id)
        values ($1, $2, 'purchased', 'consume', -2, $3)
      `, ["legacy:bob", "charge-bob-other-owner", usage[0].id]),
      /foreign key/i
    );

    await assert.rejects(
      db.query(`
        insert into public.ai_unit_ledger
        (owner_principal, event_key, balance_type, event_kind, units_delta)
        values ('legacy:alice', 'grant-alice-bad', 'included', 'grant', 100)
      `),
      /check constraint/i
    );

    await db.query(`
      insert into public.ai_unit_ledger
      (owner_principal, event_key, balance_type, event_kind, units_delta, usage_event_id)
      values ($1, $2, 'purchased', 'consume', -2, $3)
    `, ["legacy:alice", "charge-alice-1", usage[0].id]);

    const { rows: ledger } = await db.query<{ balance_type: string; units: string }>(`
      select balance_type, sum(units_delta)::text as units
      from public.ai_unit_ledger
      where owner_principal='legacy:alice'
      group by balance_type
      order by balance_type
    `);
    assert.deepEqual(ledger.map((r) => [r.balance_type, Number(r.units)]), [
      ["included", 100], ["purchased", -2],
    ]);
  } finally {
    await db.close();
  }
});
