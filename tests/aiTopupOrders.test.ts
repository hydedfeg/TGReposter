import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const packMigration=fs.readFileSync(
  path.join(root,"supabase/migrations/20261010182000_add_ai_topup_packs.sql"),"utf8");
const orderMigration=fs.readFileSync(
  path.join(root,"supabase/migrations/20261010182100_add_ai_topup_orders.sql"),"utf8");

test("top-up packs are unpublished, orders are owner-scoped and invoices single-use",async()=>{
  const db=new PGlite();
  try{
    await db.exec("create role anon; create role authenticated; create role service_role;");
    await db.exec(`
      create table public.crypto_payment_invoices(
        id uuid primary key default gen_random_uuid(),
        owner_principal text not null,
        requested_amount numeric(36,18) not null,
        status text not null,
        expires_at timestamptz not null,
        confirmed_at timestamptz,
        unique(owner_principal,id)
      );`);
    await db.exec(packMigration);
    await db.exec(orderMigration);
    const packs=await db.query<{id:string;ai_units:string;is_published:boolean}>(
      "select id,ai_units::text,is_published from public.billing_ai_topup_packs order by price_eur_cents"
    );
    assert.deepEqual(packs.rows.map(x=>x.id),["ai_mini","ai_plus","ai_pro","ai_max"]);
    assert.ok(packs.rows.every(x=>!x.is_published));
    const perms=await db.query<{rls:boolean;public_read:boolean}>(
      `select relrowsecurity as rls,has_table_privilege('authenticated',oid,'select') as public_read
       from pg_class where oid='public.billing_ai_topup_orders'::regclass`);
    assert.deepEqual(perms.rows[0],{rls:true,public_read:false});

    const invoice=await db.query<{id:string}>(
      `insert into public.crypto_payment_invoices(owner_principal,requested_amount,status,expires_at)
       values('legacy:alice',7,'pending',now()+interval '1 day') returning id`);
    const invoice2=await db.query<{id:string}>(
      `insert into public.crypto_payment_invoices(owner_principal,requested_amount,status,expires_at)
       values('legacy:alice',25,'pending',now()+interval '1 day') returning id`);

    await db.query(`
      insert into public.billing_ai_topup_orders
      (owner_principal,invoice_id,pack_id,ai_units,listed_eur_cents,quoted_usdt_amount,quote_reference)
      values ('legacy:alice',$1::uuid,'ai_mini',500,700,7,'quote-alice-01')
    `,[invoice.rows[0].id]);
    await assert.rejects(db.query(`
      insert into public.billing_ai_topup_orders
      (owner_principal,invoice_id,pack_id,ai_units,listed_eur_cents,quoted_usdt_amount,quote_reference)
      values ('legacy:alice',$1::uuid,'ai_plus',2000,2500,7,'quote-alice-02')
    `,[invoice.rows[0].id]),/duplicate key|unique constraint/i);
    await assert.rejects(db.query(`
      insert into public.billing_ai_topup_orders
      (owner_principal,invoice_id,pack_id,ai_units,listed_eur_cents,quoted_usdt_amount,quote_reference)
      values ('legacy:bob',$1::uuid,'ai_plus',2000,2500,25,'quote-bob-01')
    `,[invoice2.rows[0].id]),/foreign key/i);
  }finally{
    await db.close();
  }
});
