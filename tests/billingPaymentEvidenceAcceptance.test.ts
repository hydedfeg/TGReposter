import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {PGlite} from "@electric-sql/pglite";
import type {PoolClient} from "pg";
import {
  fulfillVerifiedSubscription,
  SubscriptionCheckoutError
} from "../server/billing/subscriptionCheckoutService";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const migrations=[
  "20261012144506_create_commercial_foundation.sql",
  "20261012144528_add_ai_usage_reconciliation.sql",
  "20261012144532_add_ai_topup_packs.sql",
  "20261012144536_add_ai_topup_orders.sql",
  "20261012144539_subscription_checkout_foundation.sql"
];

/** Synthetic confirmed transactions are DB fixtures, NOT real chain events. */
test("forged chain evidence never activates a paid plan and verified retry grants only once",async()=>{
  const db=new PGlite();
  const owner="legacy:phase10-alice";
  const other="legacy:phase10-bob";
  try{
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table public.crypto_payment_invoices (
        id uuid primary key default gen_random_uuid(),
        owner_principal text not null,status text not null default 'pending',
        requested_amount numeric(36,18) not null,
        expected_amount numeric(36,18) not null,
        network text not null,token_identifier text not null,
        receiving_address text not null,
        confirmed_at timestamptz,expires_at timestamptz not null,
        unique(owner_principal,id)
      );
      create table public.crypto_payment_transactions (
        id uuid primary key default gen_random_uuid(),
        owner_principal text not null,invoice_id uuid not null,
        network text not null,token_identifier text not null,
        to_address text not null,amount numeric(36,18) not null,
        confirmations integer not null default 0,status text not null,
        confirmed_at timestamptz
      );
    `);
    for(const name of migrations) {
      await db.exec(fs.readFileSync(path.join(root,"supabase/migrations",name),"utf8"));
    }
    await db.exec("update public.billing_plans set is_published=true where id='creator'");
    const invoice=await db.query<{id:string}>(`
      insert into public.crypto_payment_invoices
        (owner_principal,status,requested_amount,expected_amount,
         network,token_identifier,receiving_address,confirmed_at,expires_at)
      values($1,'paid',16.5,16.500001,'bsc','0xright-token','0xright-receiver',now(),now()+interval '1 hour')
      returning id`,[owner]);
    const quote=await db.query<{id:string}>(`
      insert into public.billing_fx_quotes
        (owner_principal,product_kind,plan_id,billing_interval,eur_cents,
         eur_per_usdt,usdt_amount,rate_source,expires_at)
      values($1,'subscription','creator','monthly',1500,0.925,16.5,
        'kraken:USDTEUR:ask',now()+interval '5 minutes') returning id`,[owner]);
    const order=await db.query<{id:string}>(`
      insert into public.billing_subscription_orders
        (owner_principal,quote_id,invoice_id,plan_id,billing_interval,
         listed_eur_cents,quoted_usdt_amount)
      values($1,$2::uuid,$3::uuid,'creator','monthly',1500,16.5)
      returning id`,[owner,quote.rows[0].id,invoice.rows[0].id]);
    const transfer=await db.query<{id:string}>(`
      insert into public.crypto_payment_transactions
        (owner_principal,invoice_id,network,token_identifier,
         to_address,amount,confirmations,status,confirmed_at)
      values($1,$2::uuid,'bsc','0xwrong-token','0xwrong-receiver',
        16.500001,15,'confirmed',now())
      returning id`,[owner,invoice.rows[0].id]);
    const opts={enabled:true,clientFactory:async()=>({
      query:(sql:string,params?:unknown[])=>db.query(sql,params as any[]),
      release:()=>{}
    }) as unknown as Pick<PoolClient,"query"|"release">};
    const attempt=async()=>fulfillVerifiedSubscription(owner,order.rows[0].id,opts);
    const assertRefused=async()=>{
      await assert.rejects(attempt(),(err:unknown)=>
        err instanceof SubscriptionCheckoutError && err.code==="PAYMENT_NOT_VERIFIED");
      const current=await db.query<{count:number}>(
        "select count(*)::int as count from public.billing_subscriptions");
      assert.equal(current.rows[0].count,0);
    };
    await assertRefused(); // wrong token and receiver
    await db.query(`update public.crypto_payment_transactions
      set token_identifier='0xright-token',to_address='0xright-receiver',confirmations=0
      where id=$1::uuid`,[transfer.rows[0].id]);
    await assertRefused(); // no network confirmations
    await db.query(`update public.crypto_payment_transactions
      set confirmations=15,amount=16.500002 where id=$1::uuid`,[transfer.rows[0].id]);
    await assertRefused(); // mismatched exact amount
    await db.query(`update public.crypto_payment_transactions
      set amount=16.500001,owner_principal=$1 where id=$2::uuid`,
      [other,transfer.rows[0].id]);
    await assertRefused(); // proof from a different account cannot confirm invoice

    await db.query(`update public.crypto_payment_transactions
      set owner_principal=$1 where id=$2::uuid`,[owner,transfer.rows[0].id]);
    const first=await attempt();
    assert.equal(first.created,true);
    assert.equal(first.status,"active");
    const second=await attempt();
    assert.equal(second.created,false);
    await assert.rejects(fulfillVerifiedSubscription(other,order.rows[0].id,opts),
      (err:unknown)=>err instanceof SubscriptionCheckoutError && err.code==="ORDER_NOT_FOUND");
    const counts=await db.query<{terms:number;orders:number}>(`
      select (select count(*)::int from public.billing_subscription_terms) as terms,
        (select count(*)::int from public.billing_subscription_orders
          where status='fulfilled') as orders`);
    assert.deepEqual(counts.rows[0],{terms:1,orders:1});
  } finally {
    await db.close();
  }
});
