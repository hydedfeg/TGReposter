import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {PGlite} from "@electric-sql/pglite";
import type {PoolClient} from "pg";
import {fulfillVerifiedSubscription,prepareSubscriptionOrder} from "../server/billing/subscriptionCheckoutService";
import {createSubscriptionCheckoutInvoice} from "../server/billing/subscriptionInvoiceCheckout";
import {ensureMonthlyAIAllowance} from "../server/billing/monthlyAIAllowance";
import {fulfillVerifiedTopup} from "../server/billing/aiTopupService";
import {requiredBillingConfirmations} from "../server/billing/confirmedPaymentPolicy";
import {BILLING_CANDIDATE_QUERIES,runBillingOperationsBatch} from "../server/billing/billingOperationsWorker";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const confirmationEnv={
  CRYPTO_PAYMENTS_ENABLED:"true",
  CRYPTO_USDT_BSC_ENABLED:"true",
  CRYPTO_USDT_BSC_RPC_URL:"https://example.invalid/bsc",
  CRYPTO_USDT_BSC_RECEIVING_ADDRESS:"0x2222222222222222222222222222222222222222",
  CRYPTO_USDT_BSC_CONFIRMATIONS:"120",
  CRYPTO_USDT_ETHEREUM_ENABLED:"true",
  CRYPTO_USDT_ETHEREUM_RPC_URL:"https://example.invalid/ethereum",
  CRYPTO_USDT_ETHEREUM_RECEIVING_ADDRESS:"0x2222222222222222222222222222222222222222",
  CRYPTO_USDT_ETHEREUM_CONFIRMATIONS:"80",
  CRYPTO_USDT_TON_ENABLED:"true",
  CRYPTO_USDT_TON_RPC_URL:"https://example.invalid/ton",
  CRYPTO_USDT_TON_RECEIVING_ADDRESS:"EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c",
  CRYPTO_USDT_TON_CONFIRMATIONS:"1",
};
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
           $3::numeric,120,'confirmed',now())`,[owner,invoiceId,amount]);
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
    const options={enabled:true,clientFactory:clientFactory(db),confirmationEnv};

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
    const opts={enabled:true,clientFactory:clientFactory(db),confirmationEnv};
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

test("fulfillment finality policy uses real configured chain thresholds, never a one-confirmation fallback",()=>{
  assert.equal(requiredBillingConfirmations("bsc",confirmationEnv),120);
  assert.equal(requiredBillingConfirmations("ethereum",confirmationEnv),80);
  assert.equal(requiredBillingConfirmations("ton",confirmationEnv),1);
  assert.throws(()=>requiredBillingConfirmations("bsc",{}),/not configured/);
  assert.throws(()=>requiredBillingConfirmations("unknown",confirmationEnv),/not configured/);
});

test("synthetic subscription rejects underconfirmed, wrong token, address, network and amount even when rows say paid",async()=>{
  const db=await createDb();
  try {
    const owner="legacy:alice";
    const inv=await invoice(db,owner,"16.500000","16.500001");
    const q=await db.query<{id:string}>(`
      insert into public.billing_fx_quotes
        (owner_principal,product_kind,plan_id,billing_interval,eur_cents,
         eur_per_usdt,usdt_amount,rate_source,expires_at)
      values($1,'subscription','creator','monthly',1500,0.925,16.5,
             'kraken:USDTEUR:ask',now()+interval '5 minutes')
      returning id`,[owner]);
    const o=await db.query<{id:string}>(`
      insert into public.billing_subscription_orders
        (owner_principal,quote_id,invoice_id,plan_id,billing_interval,
         listed_eur_cents,quoted_usdt_amount)
      values($1,$2::uuid,$3::uuid,'creator','monthly',1500,16.5)
      returning id`,[owner,q.rows[0].id,inv]);
    const opts={enabled:true,clientFactory:clientFactory(db),confirmationEnv};
    await confirmedTransaction(db,owner,inv,"16.500001");

    async function expectBlocked(){
      await assert.rejects(fulfillVerifiedSubscription(owner,o.rows[0].id,opts),/not fully matched/);
      const r=await db.query<{n:number}>(
        "select count(*)::int as n from public.billing_subscription_terms where owner_principal=$1",
        [owner]);
      assert.equal(r.rows[0].n,0);
    }

    await db.query("update public.crypto_payment_transactions set confirmations=1 where invoice_id=$1::uuid",[inv]);
    await expectBlocked(); // Inconsistent 'confirmed' status cannot override required 120.
    await db.query("update public.crypto_payment_transactions set confirmations=120,token_identifier='0xincorrect' where invoice_id=$1::uuid",[inv]);
    await expectBlocked();
    await db.query("update public.crypto_payment_transactions set token_identifier='0xtoken',to_address='0xattacker' where invoice_id=$1::uuid",[inv]);
    await expectBlocked();
    await db.query("update public.crypto_payment_transactions set to_address='0xreceiver',network='ethereum' where invoice_id=$1::uuid",[inv]);
    await expectBlocked();
    await db.query("update public.crypto_payment_transactions set network='bsc',amount=16.500002 where invoice_id=$1::uuid",[inv]);
    await expectBlocked();
    await assert.rejects(fulfillVerifiedSubscription("legacy:bob",o.rows[0].id,opts),/not found/);
    await db.query("update public.crypto_payment_transactions set amount=16.500001 where invoice_id=$1::uuid",[inv]);
    const success=await fulfillVerifiedSubscription(owner,o.rows[0].id,opts);
    assert.equal(success.created,true);
    const retry=await fulfillVerifiedSubscription(owner,o.rows[0].id,opts);
    assert.equal(retry.created,false);
    const count=await db.query<{n:number}>(
      "select count(*)::int as n from public.billing_subscription_terms where owner_principal=$1",[owner]);
    assert.equal(count.rows[0].n,1);
  } finally {await db.close();}
});

test("synthetic AI top-up blocks underfinalized and mismatched transfers without granting units",async()=>{
  const db=await createDb();
  try {
    const owner="legacy:alice";
    const inv=await invoice(db,owner,"7.100000","7.100001");
    const o=await db.query<{id:string}>(`
      insert into public.billing_ai_topup_orders
        (owner_principal,invoice_id,pack_id,ai_units,listed_eur_cents,
         quoted_usdt_amount,quote_reference)
      values($1,$2::uuid,'ai_mini',500,700,7.1,'test-quote-negative')
      returning id`,[owner,inv]);
    const opts={enabled:true,clientFactory:clientFactory(db),confirmationEnv};
    await confirmedTransaction(db,owner,inv,"7.100001");
    async function expectBlocked(){
      await assert.rejects(fulfillVerifiedTopup(owner,o.rows[0].id,opts),/matching confirmed transfer/);
      const result=await db.query<{n:number}>(
        "select count(*)::int as n from public.ai_unit_ledger where owner_principal=$1 and balance_type='purchased'",[owner]);
      assert.equal(result.rows[0].n,0);
    }
    await db.query("update public.crypto_payment_transactions set confirmations=1 where invoice_id=$1::uuid",[inv]);
    await expectBlocked();
    await db.query("update public.crypto_payment_transactions set confirmations=120,token_identifier='0xfake' where invoice_id=$1::uuid",[inv]);
    await expectBlocked();
    await db.query("update public.crypto_payment_transactions set token_identifier='0xtoken',to_address='0xother' where invoice_id=$1::uuid",[inv]);
    await expectBlocked();
    await db.query("update public.crypto_payment_transactions set to_address='0xreceiver',amount=7.100002 where invoice_id=$1::uuid",[inv]);
    await expectBlocked();
    await assert.rejects(fulfillVerifiedTopup("legacy:bob",o.rows[0].id,opts),/not found/);
    await db.query("update public.crypto_payment_transactions set amount=7.100001 where invoice_id=$1::uuid",[inv]);
    const success=await fulfillVerifiedTopup(owner,o.rows[0].id,opts);
    assert.equal(success.created,true);
    assert.equal((await fulfillVerifiedTopup(owner,o.rows[0].id,opts)).created,false);
    const count=await db.query<{n:number;units:string}>(
      "select count(*)::int as n,sum(units_delta)::text as units from public.ai_unit_ledger where owner_principal=$1 and balance_type='purchased'",[owner]);
    assert.deepEqual(count.rows[0],{n:1,units:"500.000000"});
    const other=await db.query<{n:number}>(
      "select count(*)::int as n from public.ai_unit_ledger where owner_principal='legacy:bob'");
    assert.equal(other.rows[0].n,0);
  } finally {await db.close();}
});

test("paid orders and included AI allowance survive product delisting without duplicate grants",async()=>{
  const db=await createDb();
  try {
    const owner="legacy:alice";
    const subscriptionInvoice=await invoice(db,owner,"16.500000","16.500001");
    const quote=await db.query<{id:string}>(`
      insert into public.billing_fx_quotes
        (owner_principal,product_kind,plan_id,billing_interval,eur_cents,
         eur_per_usdt,usdt_amount,rate_source,expires_at)
      values($1,'subscription','creator','monthly',1500,0.925,16.5,
        'kraken:USDTEUR:ask',now()+interval '5 minutes')
      returning id`,[owner]);
    const subscriptionOrder=await db.query<{id:string}>(`
      insert into public.billing_subscription_orders
        (owner_principal,quote_id,invoice_id,plan_id,billing_interval,
         listed_eur_cents,quoted_usdt_amount)
      values($1,$2::uuid,$3::uuid,'creator','monthly',1500,16.5)
      returning id`,[owner,quote.rows[0].id,subscriptionInvoice]);
    const topupInvoice=await invoice(db,owner,"7.100000","7.100001");
    const topupOrder=await db.query<{id:string}>(`
      insert into public.billing_ai_topup_orders
        (owner_principal,invoice_id,pack_id,ai_units,listed_eur_cents,
         quoted_usdt_amount,quote_reference)
      values($1,$2::uuid,'ai_mini',500,700,7.1,'test-retired-pack')
      returning id`,[owner,topupInvoice]);

    // Simulate real, previously validated chain records only in this
    // ephemeral local database. No blockchain requests or live credits.
    await confirmedTransaction(db,owner,subscriptionInvoice,"16.500001");
    await confirmedTransaction(db,owner,topupInvoice,"7.100001");
    await db.exec(`
      update public.billing_plans set is_published=false where id='creator';
      update public.billing_ai_topup_packs set is_published=false where id='ai_mini';
    `);

    const options={enabled:true,clientFactory:clientFactory(db),confirmationEnv};
    const flags={
      TGREPOSTER_BILLING_WORKER_ENABLED:"true",
      TGREPOSTER_SUBSCRIPTION_CHECKOUT_ENABLED:"true",
      TGREPOSTER_COMMERCIAL_TOPUPS_ENABLED:"true",
      TGREPOSTER_COMMERCIAL_AI_ENABLED:"true",
      TGREPOSTER_SUBSCRIPTION_MANAGEMENT_ENABLED:"true"
    };
    const run=()=>runBillingOperationsBatch({
      env:flags,
      listCandidates:async(stage,limit)=>{
        const {rows}=await db.query<{owner_principal:string;id:string}>(
          BILLING_CANDIDATE_QUERIES[stage],[limit]);
        return rows;
      },
      fulfillSubscription:async(principal,id)=>fulfillVerifiedSubscription(principal,id,options),
      fulfillTopup:async(principal,id)=>fulfillVerifiedTopup(principal,id,options),
      activateRenewal:async()=>false,
      expireSubscription:async()=>false,
      grantAllowance:async(principal)=>ensureMonthlyAIAllowance(principal,options),
      noteFailure:async()=>{throw Error("Unexpected synthetic billing failure");},
      clearFailure:async()=>{}
    });
    const first=await run();
    assert.deepEqual(first.failureCodes,[]);
    assert.equal(first.stages.subscriptions.completed,1);
    assert.equal(first.stages.topups.completed,1);
    assert.equal(first.stages.allowances.completed,1);
    const second=await run();
    assert.deepEqual(second.failureCodes,[]);
    assert.equal(second.stages.subscriptions.attempted,0);
    assert.equal(second.stages.topups.attempted,0);
    assert.equal(second.stages.allowances.attempted,0);

    const sub=await db.query<{status:string}>(`
      select status from public.billing_subscription_orders where id=$1::uuid
    `,[subscriptionOrder.rows[0].id]);
    const top=await db.query<{status:string}>(`
      select status from public.billing_ai_topup_orders where id=$1::uuid
    `,[topupOrder.rows[0].id]);
    assert.equal(sub.rows[0].status,"fulfilled");
    assert.equal(top.rows[0].status,"fulfilled");

    const {rows:grants}=await db.query<{balance_type:string;count:number;units:string}>(`
      select balance_type,count(*)::int as count,sum(units_delta)::text as units
      from public.ai_unit_ledger where owner_principal=$1 and event_kind='grant'
      group by balance_type order by balance_type
    `,[owner]);
    assert.deepEqual(grants,[
      {balance_type:"included",count:1,units:"100.000000"},
      {balance_type:"purchased",count:1,units:"500.000000"}
    ]);
    const other=await db.query<{count:number}>(`
      select count(*)::int as count from public.ai_unit_ledger
      where owner_principal='legacy:bob'
    `);
    assert.equal(other.rows[0].count,0);
  } finally {
    await db.close();
  }
});

test("subscription invoice preflight blocks invalid payable invoices and the transactional order gate blocks duplicate pending payments",async()=>{
  const db=await createDb();
  // The core billing fixture predates sales-plan editing; staging's later
  // catalog migration also adds the is_enabled plan availability switch.
  await db.exec("alter table public.billing_plans add column if not exists is_enabled boolean not null default true;");
  const previous=process.env.TGREPOSTER_SUBSCRIPTION_CHECKOUT_ENABLED;
  process.env.TGREPOSTER_SUBSCRIPTION_CHECKOUT_ENABLED="true";
  try {
    const owner="legacy:alice";
    const quote=await db.query<{id:string}>(`
      insert into public.billing_fx_quotes
        (owner_principal,product_kind,plan_id,billing_interval,eur_cents,
         eur_per_usdt,usdt_amount,rate_source,expires_at)
      values($1,'subscription','creator','monthly',1500,0.925,16.5,
        'kraken:USDTEUR:ask',now()+interval '5 minutes')
      returning id`,[owner]);
    const invoiceId=await invoice(db,owner,"16.500000","16.500001");
    const quoteId=quote.rows[0].id;
    let invoiceCalls=0;
    const issue=()=>createSubscriptionCheckoutInvoice(owner,quoteId,"bsc",{
      query:(sql,params)=>db.query(sql,params as any[]),
      invoiceService:{createInvoice:async()=>{
        invoiceCalls++;
        throw new Error("INVOICE_SERVICE_CALLED");
      }}
    });
    const countInvoices=async()=>{
      const {rows}=await db.query<{n:number}>(`
        select count(*)::int as n from public.crypto_payment_invoices`);
      return rows[0].n;
    };

    await db.exec("update public.billing_plans set is_published=false where id='creator'");
    await assert.rejects(issue(),{code:"PLAN_NOT_AVAILABLE"});
    await db.exec("update public.billing_plans set is_published=true where id='creator'");

    await db.query(`
      insert into public.billing_subscriptions(owner_principal,plan_id,billing_interval,
        status,current_period_start,current_period_end)
      values($1,'professional','monthly','active',
        now()-interval '1 day',now()+interval '30 days')`,[owner]);
    await assert.rejects(issue(),{code:"PLAN_CHANGE_NOT_READY"});
    await db.query(`
      update public.billing_subscriptions set plan_id='creator',
        cancel_at_period_end=true where owner_principal=$1`,[owner]);
    await assert.rejects(issue(),{code:"CANCELLATION_SCHEDULED"});
    await db.query(`
      update public.billing_subscriptions set cancel_at_period_end=false
      where owner_principal=$1`,[owner]);

    const otherQuote=await db.query<{id:string}>(`
      insert into public.billing_fx_quotes
        (owner_principal,product_kind,plan_id,billing_interval,eur_cents,
         eur_per_usdt,usdt_amount,rate_source,expires_at)
      values($1,'subscription','creator','monthly',1500,0.925,16.5,
        'kraken:USDTEUR:ask',now()+interval '5 minutes')
      returning id`,[owner]);
    const otherInvoice=await invoice(db,owner,"16.500000","16.500002");
    const otherOrder=await db.query<{id:string}>(`
      insert into public.billing_subscription_orders
        (owner_principal,quote_id,invoice_id,plan_id,billing_interval,
         listed_eur_cents,quoted_usdt_amount)
      values($1,$2::uuid,$3::uuid,'creator','monthly',1500,16.5)
      returning id`,[owner,otherQuote.rows[0].id,otherInvoice]);

    await assert.rejects(issue(),{code:"PAYMENT_ALREADY_PENDING"});
    await assert.rejects(
      prepareSubscriptionOrder(owner,quoteId,invoiceId,{
        enabled:true,clientFactory:clientFactory(db)
      }),
      {code:"PAYMENT_ALREADY_PENDING"}
    );
    const noOrder=await db.query<{n:number}>(`
      select count(*)::int as n from public.billing_subscription_orders
      where quote_id=$1::uuid`,[quoteId]);
    assert.equal(noOrder.rows[0].n,0);

    await db.query(`
      insert into public.billing_subscription_terms
        (owner_principal,order_id,plan_id,billing_interval,term_start,term_end,status)
      values($1,$2::uuid,'creator','monthly',
        now()+interval '30 days',now()+interval '60 days','scheduled')`,
      [owner,otherOrder.rows[0].id]);
    await assert.rejects(issue(),{code:"RENEWAL_ALREADY_SCHEDULED"});
    await db.query("delete from public.billing_subscription_terms where owner_principal=$1",[owner]);

    // Expired payment instructions are not outstanding, so the valid new
    // checkout can reach invoice creation. It still cannot process payments
    // in this synthetic test because the invoice service is a throwing stub.
    await db.query(`
      update public.crypto_payment_invoices set status='expired'
      where owner_principal=$1 and id=$2::uuid`,[owner,otherInvoice]);
    const initialInvoices=await countInvoices();
    await assert.rejects(issue(),/INVOICE_SERVICE_CALLED/);
    assert.equal(invoiceCalls,1);
    assert.equal(await countInvoices(),initialInvoices);

    // An already issued, matching invoice and quote can be attached exactly
    // once; repeated preparation is idempotent and belongs only to Alice.
    const prepared=await prepareSubscriptionOrder(owner,quoteId,invoiceId,{
      enabled:true,clientFactory:clientFactory(db)
    });
    assert.equal(prepared.created,true);
    const retried=await prepareSubscriptionOrder(owner,quoteId,invoiceId,{
      enabled:true,clientFactory:clientFactory(db)
    });
    assert.equal(retried.created,false);
    await assert.rejects(
      prepareSubscriptionOrder("legacy:bob",quoteId,invoiceId,{
        enabled:true,clientFactory:clientFactory(db)
      }),{code:"QUOTE_NOT_FOUND"});
  }finally{
    if(previous===undefined)delete process.env.TGREPOSTER_SUBSCRIPTION_CHECKOUT_ENABLED;
    else process.env.TGREPOSTER_SUBSCRIPTION_CHECKOUT_ENABLED=previous;
    await db.close();
  }
});
