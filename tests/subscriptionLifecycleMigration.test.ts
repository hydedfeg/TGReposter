import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {PGlite} from "@electric-sql/pglite";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const migration=fs.readFileSync(
  path.join(root,"supabase/migrations/20261012144548_subscription_lifecycle_events.sql"),"utf8"
);

test("subscription lifecycle audit is owner-scoped and hidden from browser roles",async()=>{
  const db=new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role;");
    await db.exec(`
      create table public.billing_subscriptions (
        id uuid primary key default gen_random_uuid(),
        owner_principal text not null,
        unique(owner_principal,id)
      );
      create table public.billing_operation_attempts (
        stage text not null check(stage in ('subscriptions','topups','renewals','allowances')),
        owner_principal text not null,
        item_id uuid not null,
        last_error_code text not null
      );
    `);
    await db.exec(migration);
    const result=await db.query<{rls:boolean;client_read:boolean}>(`
      select relrowsecurity as rls,
        has_table_privilege('authenticated',oid,'select') as client_read
      from pg_class where oid='public.billing_subscription_events'::regclass
    `);
    assert.deepEqual(result.rows[0],{rls:true,client_read:false});
    const alice=await db.query<{id:string}>(`
      insert into public.billing_subscriptions(owner_principal)
      values('legacy:alice') returning id
    `);
    const bob=await db.query<{id:string}>(`
      insert into public.billing_subscriptions(owner_principal)
      values('legacy:bob') returning id
    `);
    await db.query(`
      insert into public.billing_subscription_events
       (owner_principal,subscription_id,event_type)
      values('legacy:alice',$1,'cancel_scheduled')
    `,[alice.rows[0].id]);
    await assert.rejects(db.query(`
      insert into public.billing_subscription_events
       (owner_principal,subscription_id,event_type)
      values('legacy:alice',$1,'expired')
    `,[bob.rows[0].id]),/foreign key/i);
    await assert.rejects(db.query(`
      insert into public.billing_subscription_events
       (owner_principal,subscription_id,event_type)
      values('legacy:alice',$1,'refund_issued')
    `,[alice.rows[0].id]),/check constraint/i);
    await db.query(`
      insert into public.billing_operation_attempts
       (stage,owner_principal,item_id,last_error_code)
      values('expirations','legacy:alice',$1,'MISSED_PAID_RENEWAL')
    `,[alice.rows[0].id]);
    const events=await db.query<{count:number}>(
      "select count(*)::integer as count from public.billing_subscription_events"
    );
    assert.equal(events.rows[0].count,1);
  } finally {
    await db.close();
  }
});
