import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import express from "express";
import { PGlite } from "@electric-sql/pglite";
import type { PoolClient } from "pg";
import { createCustomerCheckoutRouter } from "../server/routes/customerCheckout";
import { createBillingOverviewRouter } from "../server/routes/billingOverview";
import { getBillingOverview } from "../server/billing/billingOverviewService";
import { prepareSubscriptionOrder, fulfillVerifiedSubscription, SubscriptionCheckoutError } from "../server/billing/subscriptionCheckoutService";
import { ensureMonthlyAIAllowance } from "../server/billing/monthlyAIAllowance";

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
const confirmationEnv = {
  CRYPTO_PAYMENTS_ENABLED: "true",
  CRYPTO_USDT_BSC_ENABLED: "true",
  CRYPTO_USDT_BSC_RPC_URL: "https://example.invalid/bsc",
  CRYPTO_USDT_BSC_RECEIVING_ADDRESS: "0x2222222222222222222222222222222222222222",
  CRYPTO_USDT_BSC_CONFIRMATIONS: "120"
};

/**
 * Authenticated HTTP -> owner-scoped quote -> invoice/order -> synthetic chain
 * evidence -> subscription -> AI allowance -> customer dashboard.
 * No secrets, live funds, staging writes, or real Supabase sessions.
 */
test("simulated two-customer HTTP subscription purchase is isolated and credits only once", async () => {
  const db = new PGlite();
  let server: ReturnType<typeof createServer> | undefined;
  try {
    await db.exec([
      "create role anon; create role authenticated; create role service_role;",
      "create table public.source_channels (id uuid primary key default gen_random_uuid(), owner_principal text not null, enabled boolean not null default true);",
      "create table public.destination_targets (id uuid primary key default gen_random_uuid(), owner_principal text not null, enabled boolean not null default true);",
      "create table public.promotion_targets (id uuid primary key default gen_random_uuid(), owner_principal text not null, enabled boolean not null default true);",
      "create table public.promotion_campaigns (id uuid primary key default gen_random_uuid(), owner_principal text not null, status text not null);",
      "create table public.crypto_payment_invoices (id uuid primary key default gen_random_uuid(), owner_principal text not null, status text not null default 'pending', requested_amount numeric(36,18) not null, expected_amount numeric(36,18) not null, network text not null, token_identifier text not null, receiving_address text not null, confirmed_at timestamptz, expires_at timestamptz not null, unique(owner_principal,id));",
      "create table public.crypto_payment_transactions (id uuid primary key default gen_random_uuid(), owner_principal text not null, invoice_id uuid not null, network text not null, token_identifier text not null, to_address text not null, amount numeric(36,18) not null, confirmations integer not null default 0, status text not null default 'pending', confirmed_at timestamptz);"
    ].join("\n"));
    for (const migration of migrations) {
      await db.exec(fs.readFileSync(path.join(root, "supabase/migrations", migration), "utf8"));
    }
    // These catalog flags exist ONLY inside this disposable in-process DB.
    await db.exec("update public.billing_plans set is_published=true where id in ('free','creator')");
    const clientFactory = async () => ({
      query: (sql: string, args?: unknown[]) => db.query(sql, args as any[]),
      release: () => {}
    }) as unknown as Pick<PoolClient, "query" | "release">;
    let enabled = true;
    const app = express();
    app.use(express.json());
    const authenticate = (req: any, _res: any, next: () => void) => {
      const header = req.get("authorization");
      if (header === "Bearer fixture-alice") req.user = {id: aliceId, authProvider: "supabase"};
      if (header === "Bearer fixture-bob") req.user = {id: bobId, authProvider: "supabase"};
      next();
    };
    app.use("/api/billing/checkout", createCustomerCheckoutRouter({
      authMiddleware: authenticate,
      enabled: () => enabled,
      topupsEnabled: () => false,
      hasDatabase: () => true,
      checkBudget: async () => {},
      catalog: async () => ({enabled, topupsEnabled: false, plans: [{id:"creator",name:"Creator",monthlyEurCents:1500,annualEurCents:15000}],packs:[],networks:["bsc"]}),
      quote: async (owner, planId, interval) => {
        assert.equal(planId, "creator");
        assert.equal(interval, "monthly");
        const rows = await db.query<{id:string;expires_at:Date}>(
          "insert into public.billing_fx_quotes (owner_principal,product_kind,plan_id,billing_interval,eur_cents,eur_per_usdt,usdt_amount,rate_source,expires_at) values ($1,'subscription','creator','monthly',1500,0.925,16.5,'kraken:USDTEUR:ask',now()+interval '5 minutes') returning id,expires_at",
          [owner]
        );
        return {id:rows.rows[0].id,ownerPrincipal:owner,product:{kind:"subscription",planId,interval},eurCents:1500,eurPerUsdt:"0.925",usdtAmount:"16.5",rateSource:"kraken:USDTEUR:ask",expiresAt:new Date(rows.rows[0].expires_at).toISOString()};
      },
      createOrder: async (owner, quoteId, network) => {
        assert.equal(network, "bsc");
        const existing = await db.query<{id:string}>(
          "select id from public.billing_subscription_orders where owner_principal=$1 and quote_id=$2::uuid",
          [owner,quoteId]
        );
        if (existing.rows[0]) return {orderId:existing.rows[0].id} as any;
        const quote = await db.query<{id:string}>(
          "select id from public.billing_fx_quotes where owner_principal=$1 and id=$2::uuid",
          [owner,quoteId]
        );
        if (!quote.rows[0]) throw new SubscriptionCheckoutError("QUOTE_NOT_FOUND","Quote not found");
        const invoice = await db.query<{id:string}>(
          "insert into public.crypto_payment_invoices(owner_principal,status,requested_amount,expected_amount,network,token_identifier,receiving_address,expires_at) values ($1,'pending',16.5,16.500001,'bsc','0xToken','0xReceiver',now()+interval '45 minutes') returning id",
          [owner]
        );
        const order = await prepareSubscriptionOrder(owner,quoteId,invoice.rows[0].id,{enabled:true,clientFactory});
        return {orderId:order.orderId} as any;
      },
      readOrder: async (owner, id) => {
        const row = await db.query<{id:string;status:string}>(
          "select id,status from public.billing_subscription_orders where owner_principal=$1 and id=$2::uuid",
          [owner,id]
        );
        return row.rows[0] ? {orderId:row.rows[0].id,orderStatus:row.rows[0].status} as any : null;
      }
    }));
    app.use("/api/billing",createBillingOverviewRouter({
      authMiddleware:authenticate,
      hasDatabase:()=>true,
      loadOverview:(owner:string)=>getBillingOverview(owner,{
        query:(sql,params)=>db.query(sql,params as any[])
      })
    }));
    server = createServer(app);
    await new Promise<void>(resolve=>server!.listen(0,"127.0.0.1",resolve));
    const addr = server.address();
    assert.ok(addr && typeof addr !== "string");
    const rootUrl = "http://127.0.0.1:" + addr.port + "/api/billing";
    const req = async (token:string|null,url:string,body?:unknown) => {
      const response = await fetch(rootUrl+url,{
        method:body===undefined?"GET":"POST",
        headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},
        ...(body===undefined?{}:{body:JSON.stringify(body)})
      });
      return {status:response.status, data:await response.json() as any};
    };
    const anonymous=await req(null,"/checkout/status");
    assert.equal(anonymous.status,401);
    const issued=await req("fixture-alice","/checkout/quotes",{planId:"creator",interval:"monthly"});
    assert.equal(issued.status,201);
    const quoteId=issued.data.quote.id;
    const forged=await req("fixture-bob","/checkout/orders",{quoteId,network:"bsc"});
    assert.notEqual(forged.status,201);
    const ordered=await req("fixture-alice","/checkout/orders",{quoteId,network:"bsc"});
    assert.equal(ordered.status,201);
    const orderId=ordered.data.order.orderId;
    const repeated=await req("fixture-alice","/checkout/orders",{quoteId,network:"bsc"});
    assert.equal(repeated.status,201);
    assert.equal(repeated.data.order.orderId,orderId);
    assert.equal((await req("fixture-bob","/checkout/orders/"+orderId)).status,404);
    const record=await db.query<{invoice_id:string;owner_principal:string}>(
      "select invoice_id,owner_principal from public.billing_subscription_orders where id=$1::uuid",[orderId]
    );
    assert.equal(record.rows[0].owner_principal,alice);
    const invoiceId=record.rows[0].invoice_id;
    const opts={enabled:true,clientFactory,confirmationEnv};
    await assert.rejects(fulfillVerifiedSubscription(alice,orderId,opts),
      (err:unknown)=>err instanceof SubscriptionCheckoutError&&err.code==="PAYMENT_NOT_CONFIRMED");
    await db.query("update public.crypto_payment_invoices set status='paid',confirmed_at=now() where id=$1::uuid",[invoiceId]);
    const transfer=await db.query<{id:string}>(
      "insert into public.crypto_payment_transactions (owner_principal,invoice_id,network,token_identifier,to_address,amount,confirmations,status,confirmed_at) values ($1,$2::uuid,'bsc','0xWrong','0xReceiver',16.500001,120,'confirmed',now()) returning id",
      [alice,invoiceId]
    );
    await assert.rejects(fulfillVerifiedSubscription(alice,orderId,opts),
      (err:unknown)=>err instanceof SubscriptionCheckoutError&&err.code==="PAYMENT_NOT_VERIFIED");
    await db.query("update public.crypto_payment_transactions set token_identifier='0xToken' where id=$1::uuid",[transfer.rows[0].id]);
    const fulfilled=await fulfillVerifiedSubscription(alice,orderId,opts);
    assert.equal(fulfilled.created,true);
    assert.equal(fulfilled.status,"active");
    assert.equal((await fulfillVerifiedSubscription(alice,orderId,opts)).created,false);
    await assert.rejects(fulfillVerifiedSubscription(bob,orderId,opts),
      (err:unknown)=>err instanceof SubscriptionCheckoutError&&err.code==="ORDER_NOT_FOUND");
    assert.equal((await ensureMonthlyAIAllowance(alice,opts)).granted,true);
    assert.equal((await ensureMonthlyAIAllowance(alice,opts)).granted,false);
    const a=await req("fixture-alice","/overview");
    const b=await req("fixture-bob","/overview?owner_principal="+encodeURIComponent(alice));
    assert.equal(a.status,200);
    assert.equal(b.status,200);
    assert.equal(a.data.overview.plan.id,"creator");
    assert.equal(Number(a.data.overview.ai.includedAvailable),100);
    assert.equal(b.data.overview.plan.id,"free");
    assert.equal(Number(b.data.overview.ai.includedAvailable),0);
    const rows=await db.query<{terms:number;grants:number;orders:number;invoices:number}>(
      "select (select count(*)::int from public.billing_subscription_terms) terms,(select count(*)::int from public.ai_unit_ledger where owner_principal=$1 and event_kind='grant') grants,(select count(*)::int from public.billing_subscription_orders) orders,(select count(*)::int from public.crypto_payment_invoices) invoices",
      [alice]
    );
    assert.deepEqual(rows.rows[0],{terms:1,grants:1,orders:1,invoices:1});
    enabled=false;
    assert.equal((await req("fixture-alice","/checkout/quotes",{planId:"creator",interval:"monthly"})).status,503);
    assert.equal((await req("fixture-alice","/checkout/orders/"+orderId)).status,200);
  } finally {
    if (server) await new Promise<void>(resolve=>server!.close(()=>resolve()));
    await db.close();
  }
});
