import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {PGlite} from "@electric-sql/pglite";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const migration=fs.readFileSync(
  path.join(root,"supabase/migrations/20261010184000_subscription_checkout_foundation.sql"),"utf8");

test("checkout schema isolates accounts, binds invoices and prevents double renewals",async()=>{
  const db=new PGlite();
  try{
    await db.exec("create role anon; create role authenticated; create role service_role;");
    await db.exec(`
      create table public.billing_plans(id text primary key);
      create table public.billing_ai_topup_packs(id text primary key);
      create table public.crypto_payment_invoices(
        id uuid primary key default gen_random_uuid(),
        owner_principal text not null,
        unique(owner_principal,id)
      );
      insert into public.billing_plans values ('creator'),('professional');
      insert into public.billing_ai_topup_packs values ('ai_mini');
    `);
    await db.exec(migration);
    const protection=await db.query<{table_name:string; rls:boolean; client_read:boolean}>(`
      select c.relname as table_name,c.relrowsecurity as rls,
        has_table_privilege('authenticated',c.oid,'select') as client_read
      from pg_class c where c.relname in (
        'billing_fx_quotes','billing_subscription_orders','billing_subscription_terms'
      ) order by c.relname
    `);
    assert.equal(protection.rows.length,3);
    assert.ok(protection.rows.every(x=>x.rls && !x.client_read));

    const invoice=await db.query<{id:string}>(`
      insert into public.crypto_payment_invoices(owner_principal)
      values('legacy:alice') returning id`);
    const invoiceBob=await db.query<{id:string}>(`
      insert into public.crypto_payment_invoices(owner_principal)
      values('legacy:bob') returning id`);
    const quote=await db.query<{id:string}>(`
      insert into public.billing_fx_quotes
       (owner_principal,product_kind,plan_id,billing_interval,
        eur_cents,eur_per_usdt,usdt_amount,rate_source,expires_at)
      values('legacy:alice','subscription','creator','monthly',
        1500,0.925,16.459460,'kraken:USDTEUR:ask',now()+interval '5 minutes')
      returning id`);
    await assert.rejects(db.query(`
      insert into public.billing_subscription_orders
       (owner_principal,quote_id,invoice_id,plan_id,billing_interval,
        listed_eur_cents,quoted_usdt_amount)
      values('legacy:bob',$1,$2,'creator','monthly',1500,16.459460)
    `,[quote.rows[0].id,invoiceBob.rows[0].id]),/foreign key/i);

    const order=await db.query<{id:string}>(`
      insert into public.billing_subscription_orders
       (owner_principal,quote_id,invoice_id,plan_id,billing_interval,
        listed_eur_cents,quoted_usdt_amount)
      values('legacy:alice',$1,$2,'creator','monthly',1500,16.459460)
      returning id
    `,[quote.rows[0].id,invoice.rows[0].id]);
    await assert.rejects(db.query(`
      insert into public.billing_subscription_orders
       (owner_principal,quote_id,invoice_id,plan_id,billing_interval,
        listed_eur_cents,quoted_usdt_amount)
      values('legacy:alice',$1,$2,'creator','monthly',1500,16.459460)
    `,[quote.rows[0].id,invoice.rows[0].id]),/unique constraint|duplicate key/i);

    await db.query(`
      insert into public.billing_subscription_terms
       (owner_principal,order_id,plan_id,billing_interval,term_start,term_end,status)
      values('legacy:alice',$1,'creator','monthly',
        '2026-10-10T00:00:00Z','2026-11-10T00:00:00Z','scheduled')
    `,[order.rows[0].id]);
    const q2=await db.query<{id:string}>(`
      insert into public.billing_fx_quotes
       (owner_principal,product_kind,plan_id,billing_interval,
        eur_cents,eur_per_usdt,usdt_amount,rate_source,expires_at)
      values('legacy:alice','subscription','creator','monthly',
        1500,0.925,16.459460,'kraken:USDTEUR:ask',now()+interval '5 minutes')
      returning id`);
    const inv2=await db.query<{id:string}>(`
      insert into public.crypto_payment_invoices(owner_principal)
      values('legacy:alice') returning id`);
    const o2=await db.query<{id:string}>(`
      insert into public.billing_subscription_orders
       (owner_principal,quote_id,invoice_id,plan_id,billing_interval,
        listed_eur_cents,quoted_usdt_amount)
      values('legacy:alice',$1,$2,'creator','monthly',1500,16.459460)
      returning id
    `,[q2.rows[0].id,inv2.rows[0].id]);
    await assert.rejects(db.query(`
      insert into public.billing_subscription_terms
       (owner_principal,order_id,plan_id,billing_interval,term_start,term_end,status)
      values('legacy:alice',$1,'creator','monthly',
        '2026-11-10T00:00:00Z','2026-12-10T00:00:00Z','scheduled')
    `,[o2.rows[0].id]),/unique constraint|duplicate key/i);
  }finally{await db.close();}
});
