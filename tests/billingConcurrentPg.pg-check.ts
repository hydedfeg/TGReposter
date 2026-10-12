/**
 * Real PostgreSQL concurrency suite. CI runs this against a disposable
 * postgres:16 service with two+ actual sockets/transactions.
 *
 * Never run this against Supabase or Railway customer databases. The test
 * enforces loopback AND an exact disposable database name before connecting.
 * It deliberately does NOT import testEnvironment.ts (which clears DB env).
 */
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { fulfillVerifiedSubscription } from "../server/billing/subscriptionCheckoutService";
import { fulfillVerifiedTopup } from "../server/billing/aiTopupService";
import { ensureMonthlyAIAllowance } from "../server/billing/monthlyAIAllowance";

const raw = process.env.PG_TEST_DATABASE_URL;
if (!raw) throw new Error("PG_TEST_DATABASE_URL is required for the isolated PostgreSQL concurrency suite.");
const url = new URL(raw);
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)
  || url.pathname !== "/tgreposter_billing_test") {
  throw new Error("Refusing to run financial write tests outside the disposable local tgreposter_billing_test database.");
}
const pool = new pg.Pool({ connectionString: raw, max: 12, connectionTimeoutMillis: 10000 });
after(async () => { await pool.end(); });

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationNames = [
  "20261012144506_create_commercial_foundation.sql",
  "20261012144528_add_ai_usage_reconciliation.sql",
  "20261012144532_add_ai_topup_packs.sql",
  "20261012144536_add_ai_topup_orders.sql",
  "20261012144539_subscription_checkout_foundation.sql",
  "20261012144544_billing_operation_retries.sql",
  "20261012144548_subscription_lifecycle_events.sql"
];

await pool.query(`
  do $roles$
  begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  end $roles$;
  create table public.crypto_payment_invoices(
    id uuid primary key default gen_random_uuid(),
    owner_principal text not null,
    status text not null default 'pending',
    requested_amount numeric(36,18) not null,
    expected_amount numeric(36,18) not null,
    network text not null,
    token_identifier text not null,
    receiving_address text not null,
    confirmed_at timestamptz,
    expires_at timestamptz not null,
    unique(owner_principal,id)
  );
  create table public.crypto_payment_transactions(
    id uuid primary key default gen_random_uuid(),
    owner_principal text not null,
    invoice_id uuid not null,
    network text not null,
    token_identifier text not null,
    to_address text not null,
    amount numeric(36,18) not null,
    confirmations integer not null default 0,
    status text not null default 'pending',
    confirmed_at timestamptz,
    foreign key(owner_principal,invoice_id)
      references public.crypto_payment_invoices(owner_principal,id)
  );
`);
for (const name of migrationNames) {
  await pool.query(fs.readFileSync(path.join(root, "supabase/migrations", name), "utf8"));
}
await pool.query("update public.billing_plans set is_published=true where id='creator'");
await pool.query("update public.billing_ai_topup_packs set is_published=true where id='ai_mini'");
const testClientFactory = () => pool.connect();

async function makeInvoice(owner: string, nominal: string, expected: string) {
  const {rows} = await pool.query<{id:string}>(`
    insert into public.crypto_payment_invoices(
      owner_principal,status,requested_amount,expected_amount,network,
      token_identifier,receiving_address,confirmed_at,expires_at)
    values($1,'paid',$2::numeric,$3::numeric,'bsc','0xtoken',
      '0xreceiver',now(),now()+interval '1 hour') returning id
  `,[owner,nominal,expected]);
  const invoiceId=rows[0].id;
  await pool.query(`
    insert into public.crypto_payment_transactions
      (owner_principal,invoice_id,network,token_identifier,to_address,amount,
       confirmations,status,confirmed_at)
    values($1,$2::uuid,'bsc','0xtoken','0xreceiver',$3::numeric,
      15,'confirmed',now())
  `,[owner,invoiceId,expected]);
  return invoiceId;
}

test("two independent PostgreSQL transactions enforce the same advisory owner lock",async()=>{
  const first=await pool.connect();
  const second=await pool.connect();
  try{
    assert.notEqual(first.processID,second.processID,"tests must use distinct PostgreSQL sessions");
    const lockKey="tgreposter:phase11:concurrency:disposable";
    await first.query("begin");
    await first.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[lockKey]);
    await second.query("begin");
    const blocked=await second.query<{acquired:boolean}>(
      "select pg_try_advisory_xact_lock(hashtextextended($1,0)) as acquired",[lockKey]);
    assert.equal(blocked.rows[0].acquired,false,"second database session must see held lock");
    await first.query("commit");
    const available=await second.query<{acquired:boolean}>(
      "select pg_try_advisory_xact_lock(hashtextextended($1,0)) as acquired",[lockKey]);
    assert.equal(available.rows[0].acquired,true);
    await second.query("rollback");
  } finally {
    try{await first.query("rollback")}catch{}
    try{await second.query("rollback")}catch{}
    first.release(); second.release();
  }
});

test("two simultaneous paid-subscription fulfillment requests create one term, then one AI grant",async()=>{
  const owner="legacy:phase11-concurrent-alice";
  const invoiceId=await makeInvoice(owner,"16.5","16.500001");
  const q=await pool.query<{id:string}>(`
    insert into public.billing_fx_quotes(
      owner_principal,product_kind,plan_id,billing_interval,eur_cents,
      eur_per_usdt,usdt_amount,rate_source,expires_at)
    values($1,'subscription','creator','monthly',1500,0.925,16.5,
      'test:phase11',now()+interval '5 minutes') returning id`,[owner]);
  const o=await pool.query<{id:string}>(`
    insert into public.billing_subscription_orders(
      owner_principal,quote_id,invoice_id,plan_id,billing_interval,
      listed_eur_cents,quoted_usdt_amount)
    values($1,$2::uuid,$3::uuid,'creator','monthly',1500,16.5)
    returning id`,[owner,q.rows[0].id,invoiceId]);
  const opts={enabled:true,clientFactory:testClientFactory};
  const [first,second]=await Promise.all([
    fulfillVerifiedSubscription(owner,o.rows[0].id,opts),
    fulfillVerifiedSubscription(owner,o.rows[0].id,opts)
  ]);
  assert.deepEqual([first.created,second.created].sort(),[false,true]);
  assert.equal(first.orderId,second.orderId);
  const terms=await pool.query<{n:number}>(`
    select count(*)::int as n from public.billing_subscription_terms
    where owner_principal=$1`,[owner]);
  assert.equal(terms.rows[0].n,1);
  const [grant1,grant2]=await Promise.all([
    ensureMonthlyAIAllowance(owner,opts),
    ensureMonthlyAIAllowance(owner,opts)
  ]);
  assert.deepEqual([grant1.granted,grant2.granted].sort(),[false,true]);
  const ledger=await pool.query<{n:number;total:string}>(`
    select count(*)::int as n,sum(units_delta)::text as total
    from public.ai_unit_ledger
    where owner_principal=$1 and balance_type='included' and event_kind='grant'`,[owner]);
  assert.equal(ledger.rows[0].n,1);
  assert.equal(Number(ledger.rows[0].total),100);
  const bob=await pool.query<{n:number}>(`
    select count(*)::int as n from public.billing_subscriptions
    where owner_principal='legacy:phase11-concurrent-bob'`);
  assert.equal(bob.rows[0].n,0);
});

test("parallel purchased-AI fulfillment is once-only and cannot cross accounts",async()=>{
  const owner="legacy:phase11-concurrent-topup";
  const invoice=await makeInvoice(owner,"7.1","7.100001");
  const order=await pool.query<{id:string}>(`
    insert into public.billing_ai_topup_orders(
      owner_principal,invoice_id,pack_id,ai_units,listed_eur_cents,
      quoted_usdt_amount,quote_reference)
    values($1,$2::uuid,'ai_mini',500,700,7.1,'phase11-quote-fixture')
    returning id`,[owner,invoice]);
  const opts={enabled:true,clientFactory:testClientFactory};
  const [a,b]=await Promise.all([
    fulfillVerifiedTopup(owner,order.rows[0].id,opts),
    fulfillVerifiedTopup(owner,order.rows[0].id,opts)
  ]);
  assert.deepEqual([a.created,b.created].sort(),[false,true]);
  assert.equal(a.fulfilled,true);
  assert.equal(b.fulfilled,true);
  const ledger=await pool.query<{n:number;units:string}>(`
    select count(*)::int as n,sum(units_delta)::text as units
    from public.ai_unit_ledger
    where owner_principal=$1 and balance_type='purchased' and event_kind='grant'`,[owner]);
  assert.equal(ledger.rows[0].n,1);
  assert.equal(Number(ledger.rows[0].units),500);
  await assert.rejects(
    fulfillVerifiedTopup("legacy:phase11-other-owner",order.rows[0].id,opts),
    /not found/i);
});
