import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {Pool} from "pg";

const uri=process.env.TEST_ENTITLEMENTS_POSTGRES_URL;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");

if(uri) {
  test("separate PostgreSQL transactions serialize owner quota writes and rollback excess",async()=>{
    const pool=new Pool({connectionString:uri,max:12,connectionTimeoutMillis:5000});
    try {
      await pool.query([
        "create role anon;create role authenticated;create role service_role;",
        "create table public.billing_plans(id text primary key,max_sources integer,max_destinations integer,max_active_campaigns integer);",
        "insert into public.billing_plans values('free',3,1,0),('creator',5,2,1);",
        "create table public.billing_subscriptions(owner_principal text primary key,plan_id text,status text,current_period_start timestamptz,current_period_end timestamptz);",
        "create table public.source_channels(id bigserial primary key,owner_principal text not null,username text,enabled boolean default true);",
        "create table public.destination_targets(id bigserial primary key,owner_principal text not null,client_id text,enabled boolean default true);",
        "create table public.promotion_targets(id bigserial primary key,owner_principal text not null,chat_id text,enabled boolean default true);",
        "create table public.promotion_campaigns(id bigserial primary key,owner_principal text not null,status text default 'draft');",
      ].join("\n"));
      const migration=fs.readFileSync(path.join(root,
        "supabase/migrations/20261019175500_atomic_plan_capacity_guards.sql"),"utf8");
      await pool.query(migration);
      const off=await pool.query("select enabled from public.billing_entitlement_enforcement");
      assert.equal(off.rows[0].enabled,false);
      await pool.query("update public.billing_entitlement_enforcement set enabled=true");
      const create=async(owner:string,num:number)=>{
        const client=await pool.connect();
        try{
          await client.query("begin");
          await client.query("insert into public.source_channels(owner_principal,username) values($1,$2)",[owner,"s"+num]);
          await client.query("commit");
          return "accepted";
        }catch(error){
          await client.query("rollback");
          if((error as {code?:string}).code==="PZ409")return "limited";
          throw error;
        }finally{client.release();}
      };
      const results=await Promise.all([
        ...Array.from({length:14},(_,i)=>create("legacy:alice",i)),
        ...Array.from({length:14},(_,i)=>create("legacy:bob",i)),
      ]);
      assert.equal(results.filter(x=>x==="accepted").length,6);
      assert.equal(results.filter(x=>x==="limited").length,22);
      const count=await pool.query(
        "select owner_principal,count(*)::int as n from public.source_channels group by owner_principal order by owner_principal");
      assert.deepEqual(count.rows,[{owner_principal:"legacy:alice",n:3},
        {owner_principal:"legacy:bob",n:3}]);
      // Competing writers via DIFFERENT tables share the SAME owner advisory lock.
      const insertDest=async(table:"destination_targets"|"promotion_targets",name:string)=>{
        const client=await pool.connect();
        const column=table==="destination_targets"?"client_id":"chat_id";
        try{
          await client.query("begin");
          await client.query("insert into public."+table+"(owner_principal,"+column+") values($1,$2)",
            ["legacy:alice",name]);
          await client.query("commit");
          return "accepted";
        }catch(err){
          await client.query("rollback");
          if((err as {code?:string}).code==="PZ409")return "limited";
          throw err;
        }finally{client.release();}
      };
      const simultaneous=await Promise.all([
        insertDest("destination_targets","personal"),
        insertDest("promotion_targets","promotional"),
      ]);
      assert.deepEqual(simultaneous.sort(),["accepted","limited"]);
      const totals=await pool.query(
        "select (select count(*)::int from public.destination_targets) + (select count(*)::int from public.promotion_targets) as total");
      assert.equal(totals.rows[0].total,1);
      // Disabling remains possible when quota is full.
      await pool.query("update public.destination_targets set enabled=false where owner_principal='legacy:alice'");
      await pool.query("update public.promotion_targets set enabled=false where owner_principal='legacy:alice'");
    }finally{await pool.end();}
  });
}
