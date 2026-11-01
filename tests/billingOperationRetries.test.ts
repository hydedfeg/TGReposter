import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {PGlite} from "@electric-sql/pglite";
import {checkBillingRetryCandidate} from "../server/billing/billingOperationsRetry";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const migration=fs.readFileSync(
 path.join(root,"supabase/migrations/20261012144544_billing_operation_retries.sql"),"utf8");

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

test("expiration retry stage accepts existing rows and retains service-only RLS",async()=>{
  const db=new PGlite();
  try{
    await db.exec("create role anon; create role authenticated; create role service_role;");
    await db.exec(migration);
    const id="10000000-0000-4000-8000-000000000001";
    const sql="insert into public.billing_operation_attempts (stage,owner_principal,item_id,last_error_code) values($1,$2,$3::uuid,$4)";
    await db.query(sql,["subscriptions","supabase:alice",id,"RETRY_FAILED"]);
    await assert.rejects(db.query(sql,["expirations","supabase:alice",id,"RETRY_FAILED"]),/check constraint/i);
    const patch=fs.readFileSync(path.join(root,
      "supabase/migrations/20261017143000_allow_billing_expiration_retries.sql"),"utf8");
    await db.exec(patch);
    await db.exec(patch);
    await db.query(sql,["expirations","supabase:alice",id,"RETRY_FAILED"]);
    const result=await db.query<{stage:string;total:number}>(
      "select stage,count(*)::int as total from public.billing_operation_attempts group by stage order by stage");
    assert.deepEqual(result.rows,[{stage:"expirations",total:1},
      {stage:"subscriptions",total:1}]);
    await assert.rejects(db.query(sql,["unknown","supabase:alice",id,"RETRY_FAILED"]),/check constraint/i);
    const perms=await db.query<{rls:boolean;readable:boolean}>(
      "select relrowsecurity as rls,has_table_privilege('authenticated',oid,'select') as readable from pg_class where oid='public.billing_operation_attempts'::regclass");
    assert.deepEqual(perms.rows[0],{rls:true,readable:false});
  }finally{await db.close();}
});

test("expiration retries validate server-owned identities",()=>{
  const c={owner_principal:"supabase:alice",id:"10000000-0000-4000-8000-000000000001"};
  assert.doesNotThrow(()=>checkBillingRetryCandidate("expirations",c));
  assert.throws(()=>checkBillingRetryCandidate("invalid" as any,c),/Invalid internal/);
  assert.throws(()=>checkBillingRetryCandidate("expirations",{...c,id:"bad"}),/Invalid internal/);
  assert.throws(()=>checkBillingRetryCandidate("expirations",{...c,owner_principal:""}),/Invalid internal/);
});
