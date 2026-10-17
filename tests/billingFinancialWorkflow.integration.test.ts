import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {PGlite} from "@electric-sql/pglite";
import type {PoolClient} from "pg";
import {fulfillVerifiedSubscription} from "../server/billing/subscriptionCheckoutService";
import {ensureMonthlyAIAllowance} from "../server/billing/monthlyAIAllowance";
import {fulfillVerifiedTopup} from "../server/billing/aiTopupService";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const migrations=[
 "20261012144506_create_commercial_foundation.sql",
 "20261012144528_add_ai_usage_reconciliation.sql",
 "20261012144532_add_ai_topup_packs.sql",
 "20261012144536_add_ai_topup_orders.sql",
 "20261012144539_subscription_checkout_foundation.sql",
 "20261012144544_billing_operation_retries.sql",
 "20261012144548_subscription_lifecycle_events.sql"
];

async function createDb() {
  const db=new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    -- Exactly the fields used by existing commercial services. The chain
    -- watcher itself is deliberately not called in this synthetic test.
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
      confirmed_at timestamptz
    );
  `);
  for(const filename of migrations) {
    const sql=fs.readFileSync(path.join(root,"supabase/migrations",filename),"utf8");
    await db.exec(sql);
  }
  // This only publishes test fixture products inside an ephemeral process DB.
  await db.exec(`
    update public.billing_plans set is_published=true where id='creator';
    update public.billing_ai_topup_packs set is_published=true where id='ai_mini';
  `);
  return db;
}

function clientFactory(db:PGlite) {
  return async()=>({
    query:(sql:string,values?:unknown[])=>db.query(sql,values as any[]),
    release:()=>{}
  }) as unknown as Pick<PoolClient,"query"|"release">;
}

async function invoice(db:PGlite,owner:string,nominal:string,expected:string) {
  const {rows}=await db.query<{id:string}>(`
    insert into public.crypto_payment_invoices
      (owner_principal,requested_amount,expected_amount,network,
       token_identifier,receiving_address,expires_at)
    values($1,$2::numeric,$3::numeric,'bsc','0xToken','0xReceiver',now()+interval '1 hour')
    returning id`,[owner,nominal,expected]);
  return rows[0].id;
}
async function confirmedTransaction(db:PGlite,owner:string,invoiceId:string,amount:string) {
  await db.query(`
    insert into public.crypto_payment_transactions
      (owner_principal,invoice_id,network,token_identifier,to_address,
       amount,confirmations,status,confirmed_at)
    values($1,$2::uuid,'bsc','0xtoken','0xreceiver',
           $3::numeric,15,'confirmed',now())`,[owner,invoiceId,amount]);
  await db.query(`
    update public.crypto_payment_invoices set status='paid',confirmed_at=now()
    where owner_principal=$1 and id=$2::uuid`,[owner,invoiceId]);
}

test("synthetic confirmed subscription creates one paid term and one monthly grant",async()=>{
  const db=await createDb();
  try {
    const owner="legacy:alice";
    const inv=await invoice(db,owner,"16.500000","16.500001");
    const quote=await db.query<{id:string}>(`
      insert into public.billing_fx_quotes
        (owner_principal,product_kind,plan_id,billing_interval,eur_cents,
         eur_per_usdt,usdt_amount,rate_source,expires_at)
      values($1,'subscription','creator','monthly',1500,0.925,16.5,
        'kraken:USDTEUR:ask',now()+interval '5 minutes')
      returning id`,[owner]);
    const order=await db.query<{id:string}>(`
      insert into public.billing_subscription_orders
        (owner_principal,quote_id,invoice_id,plan_id,billing_interval,
         listed_eur_cents,quoted_usdt_amount)
      values($1,$2::uuid,$3::uuid,'creator','monthly',1500,16.5)
      returning id`,[owner,quote.rows[0].id,inv]);
    const options={enabled:true,clientFactory:clientFactory(db)};

    await assert.rejects(
      fulfillVerifiedSubscription(owner,order.rows[0].id,options),/not confirmed/
    );
    const before=await db.query<{n:number}>(`
      select count(*)::integer as n from public.billing_subscriptions`);
    assert.equal(before.rows[0].n,0);

    await confirmedTransaction(db,owner,inv,"16.500001");
    const activated=await fulfillVerifiedSubscription(owner,order.rows[0].id,options);
    assert.equal(activated.created,true);
    assert.equal(activated.status,"active");
    assert.equal(activated.planId,"creator");

    const duplicate=await fulfillVerifiedSubscription(owner,order.rows[0].id,options);
    assert.equal(duplicate.created,false);
    const termCount=await db.query<{n:number}>(`
      select count(*)::integer as n from public.billing_subscription_terms
      where owner_principal=$1`,[owner]);
    assert.equal(termCount.rows[0].n,1);

    const first=await ensureMonthlyAIAllowance(owner,options);
    assert.equal(first.granted,true);
    assert.equal(Number(first.units),100);
    const second=await ensureMonthlyAIAllowance(owner,options);
    assert.equal(second.granted,false);

    const grants=await db.query<{n:number;total:string}>(`
      select count(*)::integer as n,coalesce(sum(units_delta),0)::text as total
      from public.ai_unit_ledger
      where owner_principal=$1 and balance_type='included' and event_kind='grant'
    `,[owner]);
    assert.equal(grants.rows[0].n,1);
    assert.equal(Number(grants.rows[0].total),100);
    const bob=await db.query<{n:number}>(`
      select count(*)::integer as n from public.ai_unit_ledger
      where owner_principal='legacy:bob'`);
    assert.equal(bob.rows[0].n,0);
  }finally{
    await db.close();
  }
});

test("synthetic AI top-up requires verified payment and credits owner only once",async()=>{
  const db=await createDb();
  try{
    const owner="legacy:alice";
    const inv=await invoice(db,owner,"7.100000","7.100001");
    const order=await db.query<{id:string}>(`
      insert into public.billing_ai_topup_orders
        (owner_principal,invoice_id,pack_id,ai_units,listed_eur_cents,
         quoted_usdt_amount,quote_reference)
      values($1,$2::uuid,'ai_mini',500,700,7.1,'test-quote-00001')
      returning id`,[owner,inv]);
    const opts={enabled:true,clientFactory:clientFactory(db)};
    await assert.rejects(fulfillVerifiedTopup(owner,order.rows[0].id,opts),/not confirmed/);
    await confirmedTransaction(db,owner,inv,"7.100001");
    const result=await fulfillVerifiedTopup(owner,order.rows[0].id,opts);
    assert.equal(result.fulfilled,true);
    assert.equal(result.created,true);
    const repeat=await fulfillVerifiedTopup(owner,order.rows[0].id,opts);
    assert.equal(repeat.created,false);
    await assert.rejects(fulfillVerifiedTopup("legacy:bob",order.rows[0].id,opts),
      /not found/);
    const grants=await db.query<{n:number;units:string}>(`
      select count(*)::integer as n,sum(units_delta)::text as units
      from public.ai_unit_ledger
      where owner_principal=$1 and balance_type='purchased' and event_kind='grant'
    `,[owner]);
    assert.equal(grants.rows[0].n,1);
    assert.equal(Number(grants.rows[0].units),500);
  }finally{
    await db.close();
  }
});
