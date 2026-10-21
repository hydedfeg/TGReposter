import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import express from "express";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBillingOverviewRouter } from "../server/routes/billingOverview";
import { getBillingOverview } from "../server/billing/billingOverviewService";

/**
 * HTTP acceptance tests with two fixture identities backed by the actual
 * commercial schema and a real in-process PostgreSQL engine.
 *
 * Fixture tokens are deliberately NOT real Supabase Auth sessions. These
 * tests exercise server-side identity propagation, not Supabase login itself.
 * No external database, blockchain or wallet is contacted.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrations = [
  "20261012144506_create_commercial_foundation.sql",
  "20261012144528_add_ai_usage_reconciliation.sql",
  "20261012144532_add_ai_topup_packs.sql",
  "20261012144536_add_ai_topup_orders.sql",
  "20261012144539_subscription_checkout_foundation.sql",
  "20261012144544_billing_operation_retries.sql",
  "20261012144548_subscription_lifecycle_events.sql"
];
const aliceId = "11111111-1111-4111-8111-111111111111";
const bobId = "22222222-2222-4222-8222-222222222222";
const alice = "supabase:" + aliceId;
const bob = "supabase:" + bobId;

async function database() {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table public.source_channels (
        id uuid primary key default gen_random_uuid(),
        owner_principal text not null, enabled boolean not null default true
      );
      create table public.destination_targets (
        id uuid primary key default gen_random_uuid(),
        owner_principal text not null, enabled boolean not null default true
      );
      -- Current billing usage includes both direct and promotional targets.
      create table public.promotion_targets (
        id uuid primary key default gen_random_uuid(),
        owner_principal text not null, enabled boolean not null default true
      );
      create table public.promotion_campaigns (
        id uuid primary key default gen_random_uuid(),
        owner_principal text not null, status text not null
      );
      create table public.crypto_payment_invoices (
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
      create table public.crypto_payment_transactions (
        id uuid primary key default gen_random_uuid(),
        owner_principal text not null,
        invoice_id uuid not null,
        network text not null, token_identifier text not null,
        to_address text not null, amount numeric(36,18) not null,
        confirmations integer not null default 0,
        status text not null default 'pending',
        confirmed_at timestamptz
      );
    `);
    for (const filename of migrations) {
      await db.exec(fs.readFileSync(path.join(root, "supabase/migrations", filename), "utf8"));
    }
    await db.exec("update public.billing_plans set is_published=true where id in ('free','creator','professional')");
    await db.query(`
      insert into public.billing_subscriptions
        (owner_principal,plan_id,billing_interval,status,payment_provider,
         current_period_start,current_period_end)
      values
        ($1,'creator','monthly','active','crypto',now()-interval '1 day',now()+interval '29 days'),
        ($2,'professional','annual','active','crypto',now()-interval '1 day',now()+interval '364 days')
    `, [alice,bob]);
    await db.query(`
      insert into public.ai_unit_ledger
        (owner_principal,event_key,balance_type,event_kind,units_delta,period_start,period_end)
      values
        ($1,'test-alice-included','included','grant',100,now()-interval '1 day',now()+interval '29 days'),
        ($1,'test-alice-bought','purchased','grant',500,null,null),
        ($2,'test-bob-included','included','grant',400,now()-interval '1 day',now()+interval '29 days'),
        ($2,'test-bob-bought','purchased','grant',2000,null,null)
    `,[alice,bob]);
    await db.query(`
      insert into public.source_channels(owner_principal,enabled)
      values($1,true),($1,true),($1,false),($2,true)
    `,[alice,bob]);
    await db.query(`
      insert into public.destination_targets(owner_principal,enabled)
      values($1,true),($2,true),($2,true)
    `,[alice,bob]);
    await db.query(`
      insert into public.promotion_campaigns(owner_principal,status)
      values($1,'running'),($2,'ready'),($2,'paused')
    `,[alice,bob]);
    return db;
  } catch(error) {
    await db.close();
    throw error;
  }
}

test("two simulated authenticated sessions see only their own real-schema billing projections", async () => {
  const db = await database();
  const app=express();
  app.use("/api/billing",createBillingOverviewRouter({
    hasDatabase:()=>true,
    authMiddleware:(req:any,_res,next)=>{
      const token = req.get("authorization");
      if(token==="Bearer fixture-alice") req.user={id:aliceId,authProvider:"supabase"};
      else if(token==="Bearer fixture-bob") req.user={id:bobId,authProvider:"supabase"};
      next();
    },
    loadOverview:(owner:string)=>getBillingOverview(owner,{
      query:(sql,params)=>db.query(sql,params as any[])
    })
  }));
  const server=createServer(app);
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  try {
    const addr=server.address();
    if(!addr || typeof addr==="string")throw Error("Missing test HTTP listener");
    const base=`http://127.0.0.1:${addr.port}/api/billing/overview`;
    const anonymous=await fetch(base);
    assert.equal(anonymous.status,401);
    const aliceResponse=await fetch(base+"?owner_principal="+encodeURIComponent(bob),{
      headers:{Authorization:"Bearer fixture-alice"}
    });
    const bobResponse=await fetch(base+"?owner_principal="+encodeURIComponent(alice),{
      headers:{Authorization:"Bearer fixture-bob"}
    });
    assert.equal(aliceResponse.status,200);
    assert.equal(bobResponse.status,200);
    assert.match(aliceResponse.headers.get("cache-control")??"",/no-store/);
    const aliceView=(await aliceResponse.json()).overview;
    const bobView=(await bobResponse.json()).overview;
    assert.equal(aliceView.plan.id,"creator");
    assert.equal(bobView.plan.id,"professional");
    assert.equal(aliceView.subscription.interval,"monthly");
    assert.equal(bobView.subscription.interval,"annual");
    assert.deepEqual(aliceView.usage,{
      users:null,sources:2,destinations:1,activeCampaigns:1
    });
    assert.deepEqual(bobView.usage,{
      users:null,sources:1,destinations:2,activeCampaigns:1
    });
    assert.equal(Number(aliceView.ai.includedAvailable),100);
    assert.equal(Number(aliceView.ai.purchasedAvailable),500);
    assert.equal(Number(bobView.ai.includedAvailable),400);
    assert.equal(Number(bobView.ai.purchasedAvailable),2000);
    assert.deepEqual(aliceView.orders,[]);
    assert.deepEqual(bobView.orders,[]);
    for(const view of [aliceView,bobView]) {
      assert.ok(!("ownerPrincipal" in view));
      assert.ok(!("walletAddress" in view));
      assert.ok(!("receivingAddress" in view));
    }
  } finally {
    await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    await db.close();
  }
});
