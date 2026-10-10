import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {PGlite} from "@electric-sql/pglite";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const migration=fs.readFileSync(
 path.join(root,"supabase/migrations/20261010191500_billing_operation_retries.sql"),"utf8");

test("retry table is private, owner-scoped and keyed by operation",async()=>{
 const db=new PGlite();
 try{
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec(migration);
  const {rows:perms}=await db.query<{rls:boolean;auth_select:boolean}>(`
    select relrowsecurity as rls,
      has_table_privilege('authenticated',oid,'select') as auth_select
    from pg_class where oid='public.billing_operation_attempts'::regclass
  `);
  assert.deepEqual(perms[0],{rls:true,auth_select:false});
  const id="10000000-0000-4000-8000-000000000001";
  await db.query(`
    insert into public.billing_operation_attempts
      (stage,owner_principal,item_id,last_error_code)
    values('subscriptions','supabase:alice',$1::uuid,'PAYMENT_NOT_VERIFIED')
  `,[id]);
  await assert.rejects(db.query(`
    insert into public.billing_operation_attempts
      (stage,owner_principal,item_id,last_error_code)
    values('subscriptions','supabase:alice',$1::uuid,'PAYMENT_NOT_VERIFIED')
  `,[id]),/duplicate|unique/i);
  await db.query(`
    insert into public.billing_operation_attempts
      (stage,owner_principal,item_id,last_error_code)
    values('topups','supabase:alice',$1::uuid,'PAYMENT_NOT_VERIFIED')
  `,[id]);
  await db.query(`
    insert into public.billing_operation_attempts
      (stage,owner_principal,item_id,last_error_code)
    values('subscriptions','supabase:bob',$1::uuid,'PAYMENT_NOT_VERIFIED')
  `,[id]);
  const {rows:count}=await db.query<{count:number}>(
    "select count(*)::int as count from public.billing_operation_attempts");
  assert.equal(count[0].count,3);
 } finally{await db.close();}
});
