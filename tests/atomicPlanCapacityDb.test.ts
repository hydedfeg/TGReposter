import test from "node:test";
import assert from "node:assert/strict";
import {PGlite} from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
// Test cases execute sequentially; reset only their data so PGlite is started once.
let sharedDb:PGlite|undefined;
test.after(async()=>{if(sharedDb)await sharedDb.close();});
const sql=fs.readFileSync(path.join(root,
  "supabase/migrations/20261019175500_atomic_plan_capacity_guards.sql"),"utf8");
const alice="legacy:alice",bob="legacy:bob";
const blocked=(e:unknown)=>Boolean(e&&typeof e==="object"&&"code" in e&&
  (e as {code:unknown}).code==="PZ409");

async function fixture(){
  if(sharedDb){
    await sharedDb.exec("truncate public.source_channels,public.destination_targets,public.promotion_targets,public.promotion_campaigns,public.billing_subscriptions restart identity; delete from public.billing_entitlement_enforcement; insert into public.billing_entitlement_enforcement(singleton,enabled) values(true,false);");
    return sharedDb;
  }
  const db=new PGlite();
  await db.exec([
    "create role anon;create role authenticated;create role service_role;",
    "create table public.billing_plans(id text primary key,max_sources integer,max_destinations integer,max_active_campaigns integer);",
    "insert into public.billing_plans values('free',3,1,0),('creator',5,2,1),('enterprise',null,null,null);",
    "create table public.billing_subscriptions(owner_principal text primary key,plan_id text,status text,current_period_start timestamptz,current_period_end timestamptz);",
    "create table public.source_channels(id bigserial primary key,owner_principal text not null,username text not null,enabled boolean default true,unique(owner_principal,username));",
    "create table public.destination_targets(id bigserial primary key,owner_principal text not null,client_id text not null,enabled boolean default true,unique(owner_principal,client_id));",
    "create table public.promotion_targets(id bigserial primary key,owner_principal text not null,chat_id text not null,enabled boolean default true,unique(owner_principal,chat_id));",
    "create table public.promotion_campaigns(id bigserial primary key,owner_principal text not null,status text default 'draft');"
  ].join("\n"));
  await db.exec(sql);
  sharedDb=db;
  return db;
}
async function paid(db:PGlite,owner=alice,plan="creator"){
  await db.query("insert into public.billing_subscriptions(owner_principal,plan_id,status,current_period_start,current_period_end) values($1,$2,'active',now()-interval '1 day',now()+interval '1 day')",[owner,plan]);
}
const source=(db:PGlite,owner:string,id:string)=>db.query(
  "insert into public.source_channels(owner_principal,username) values($1,$2)",[owner,id]);
const personal=(db:PGlite,owner:string,id:string)=>db.query(
  "insert into public.destination_targets(owner_principal,client_id) values($1,$2)",[owner,id]);
const promoTarget=(db:PGlite,owner:string,id:string)=>db.query(
  "insert into public.promotion_targets(owner_principal,chat_id) values($1,$2)",[owner,id]);

test("capacity enforcement is disabled by default and customers cannot configure it",async()=>{
  const db=await fixture();
    const policy=await db.query<{enabled:boolean}>(
      "select enabled from public.billing_entitlement_enforcement where singleton=true");
    assert.deepEqual(policy.rows,[{enabled:false}]);
    const grants=await db.query<{rls:boolean;readable:boolean;writable:boolean}>(
      "select relrowsecurity as rls,has_table_privilege('authenticated',oid,'select') as readable,has_table_privilege('authenticated',oid,'update') as writable from pg_class where oid='public.billing_entitlement_enforcement'::regclass");
    assert.deepEqual(grants.rows[0],{rls:true,readable:false,writable:false});
    for(let i=0;i<5;i++)await source(db,alice,"s"+i);
    const count=await db.query<{n:number}>(
      "select count(*)::int as n from public.source_channels where owner_principal=$1",[alice]);
    assert.equal(count.rows[0].n,5);
  
});

test("direct source writes obey owner-specific free limits, including simultaneous calls",async()=>{
  const db=await fixture();
    await db.exec("update public.billing_entitlement_enforcement set enabled=true");
    const outcomes=await Promise.allSettled(Array.from({length:9},(_,i)=>
      source(db,alice,"source"+i)));
    assert.equal(outcomes.filter(x=>x.status==="fulfilled").length,3);
    assert.equal(outcomes.filter(x=>x.status==="rejected").length,6);
    assert.ok(outcomes.filter(x=>x.status==="rejected")
      .every(x=>x.status==="rejected"&&blocked(x.reason)));
    for(let i=0;i<3;i++)await source(db,bob,"bob"+i);
    await assert.rejects(source(db,bob,"extra"),blocked);
    await db.query("update public.source_channels set enabled=false where owner_principal=$1 and username='source0'",[alice]);
    await source(db,alice,"new");
    await assert.rejects(db.query(
      "update public.source_channels set enabled=true where owner_principal=$1 and username='source0'",[alice]),blocked);
  
});

test("personal and promotion targets share the same serialized destination cap",async()=>{
  const db=await fixture();
    await db.exec("update public.billing_entitlement_enforcement set enabled=true");
    await personal(db,alice,"personal");
    await assert.rejects(promoTarget(db,alice,"campaign"),blocked);
    await db.query("update public.destination_targets set enabled=false where owner_principal=$1",[alice]);
    await promoTarget(db,alice,"campaign");
    await assert.rejects(db.query(
      "update public.destination_targets set enabled=true where owner_principal=$1",[alice]),blocked);
    await paid(db);
    await db.query("update public.destination_targets set enabled=true where owner_principal=$1",[alice]);
    await assert.rejects(personal(db,alice,"third"),blocked);
  
});

test("campaign activation, retries, downgrades and Enterprise null limits",async()=>{
  const db=await fixture();
    await db.exec("update public.billing_entitlement_enforcement set enabled=true");
    const r=await db.query<{id:number}>(
      "insert into public.promotion_campaigns(owner_principal) values($1) returning id",[alice]);
    const id=r.rows[0].id;
    await assert.rejects(db.query(
      "update public.promotion_campaigns set status='ready' where id=$1",[id]),blocked);
    await paid(db);
    await db.query("update public.promotion_campaigns set status='ready' where id=$1",[id]);
    await db.query("update public.promotion_campaigns set status='running' where id=$1",[id]);
    const other=await db.query<{id:number}>(
      "insert into public.promotion_campaigns(owner_principal) values($1) returning id",[alice]);
    await assert.rejects(db.query(
      "update public.promotion_campaigns set status='running' where id=$1",[other.rows[0].id]),blocked);
    await db.query("update public.promotion_campaigns set status='partial' where id=$1",[id]);
    await db.query("update public.promotion_campaigns set status='ready' where id=$1",[other.rows[0].id]);
    await db.query("update public.billing_subscriptions set status='expired' where owner_principal=$1",[alice]);
    await assert.rejects(db.query(
      "update public.promotion_campaigns set status='running' where id=$1",[id]),blocked);
    await db.query("update public.promotion_campaigns set status='cancelled' where id=$1",[other.rows[0].id]);
    await paid(db,bob,"enterprise");
    for(let i=0;i<8;i++){
      await source(db,bob,"s"+i);
      await db.query("insert into public.promotion_campaigns(owner_principal,status) values($1,'ready')",[bob]);
    }
  
});

test("a missing policy row cannot silently bypass enabled capacity enforcement",async()=>{
  const db=await fixture();
    await db.exec("delete from public.billing_entitlement_enforcement");
    await assert.rejects(personal(db,alice,"x"),
      (e:unknown)=>Boolean(e&&typeof e==="object"&&"code" in e&&
        (e as {code:unknown}).code==="PZ500"));
  
});
