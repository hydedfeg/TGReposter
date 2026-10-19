import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import {listSalesPlanCatalog,saveDraftSalesPlan,SalesPlanAdminError} from "../server/billing/salesPlanAdminService";
import type { PoolClient } from "pg";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const baseline=fs.readFileSync(path.join(root,"supabase/migrations/20261012144506_create_commercial_foundation.sql"),"utf8");
const migration=fs.readFileSync(path.join(root,"supabase/migrations/20261019180000_sales_plan_management.sql"),"utf8");

async function dbFixture() {
  const db=new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec(baseline);
  await db.exec(migration);
  return db;
}
const dependencies=(db:PGlite)=>({
  query:(sql:string,params:unknown[]=[])=>db.query(sql,params as any[]),
  clientFactory:async()=>({
    query:(sql:string,params?:unknown[])=>db.query(sql,params as any[]),
    release:()=>{}
  }) as unknown as Pick<PoolClient,"query"|"release">
});
const actor={username:"owner-admin",authProvider:"legacy"};

test("new audit table has RLS, denies anonymous/authenticated and starts unpublished",async()=>{
  const db=await dbFixture();
  try{
    const res=await db.query<{table:string;rls:boolean;anon:boolean;auth:boolean}>(`
      select c.relname as table,c.relrowsecurity as rls,
        has_table_privilege('anon',c.oid,'SELECT') as anon,
        has_table_privilege('authenticated',c.oid,'INSERT') as auth
      from pg_class c where c.oid='public.billing_plan_change_events'::regclass`);
    assert.equal(res.rows[0].rls,true);
    assert.equal(res.rows[0].anon,false);
    assert.equal(res.rows[0].auth,false);
    const catalog=await listSalesPlanCatalog(dependencies(db));
    assert.equal(catalog.plans.length,6);
    assert.ok(catalog.plans.every(p=>p.revision===1 && p.isEnabled && !p.isPublished));
    assert.equal(catalog.publicationEnabled,false);
    assert.equal(catalog.newTierCreationEnabled,false);
  }finally{await db.close();}
});

test("super-admin draft change updates normalized catalog, features and immutable audit once",async()=>{
  const prior=process.env.TGREPOSTER_SALES_PLAN_EDITOR_ENABLED;
  process.env.TGREPOSTER_SALES_PLAN_EDITOR_ENABLED="true";
  const db=await dbFixture();
  try{
    const options=dependencies(db);
    const catalog=await listSalesPlanCatalog(options);
    const plan=catalog.plans.find(p=>p.id==="creator")!;
    const {id:_,sortOrder:__,isPublished:___,...draft}=plan;
    const changed=await saveDraftSalesPlan("creator",{
      ...draft,displayName:"Creator Plus",monthlyEurCents:1700,
      annualEurCents:17000,maxSources:20,isEnabled:false,
      featureCodes:["content_inbox","ai_processing"]
    },actor,options);
    assert.equal(changed.revision,2);
    assert.equal(changed.monthlyEurCents,1700);
    assert.equal(changed.isEnabled,false);
    const updated=(await listSalesPlanCatalog(options)).plans.find(p=>p.id==="creator")!;
    assert.equal(updated.displayName,"Creator Plus");
    assert.deepEqual(updated.featureCodes,["ai_processing","content_inbox"]);
    assert.equal(updated.isPublished,false);
    const audit=await db.query<{actor_principal:string;before:string;after:string;previous_revision:number;new_revision:number}>(`
      select actor_principal,previous_state::text as before,new_state::text as after,
       previous_revision,new_revision
       from public.billing_plan_change_events where plan_id='creator'`);
    assert.equal(audit.rows.length,1);
    assert.equal(audit.rows[0].actor_principal,"legacy:owner-admin");
    assert.equal(audit.rows[0].previous_revision,1);
    assert.equal(audit.rows[0].new_revision,2);
    await assert.rejects(saveDraftSalesPlan("creator",{
      ...draft,displayName:"Stale Write"
    },actor,options),(e:unknown)=>e instanceof SalesPlanAdminError&&e.code==="PLAN_EDIT_CONFLICT");
    assert.equal((await db.query<{n:number}>(`
      select count(*)::int as n from public.billing_plan_change_events`)).rows[0].n,1);
  }finally{
    await db.close();
    if(prior===undefined)delete process.env.TGREPOSTER_SALES_PLAN_EDITOR_ENABLED;
    else process.env.TGREPOSTER_SALES_PLAN_EDITOR_ENABLED=prior;
  }
});

test("invalid free pricing, unknown features, published plans and active subscriptions fail closed",async()=>{
  const prior=process.env.TGREPOSTER_SALES_PLAN_EDITOR_ENABLED;
  process.env.TGREPOSTER_SALES_PLAN_EDITOR_ENABLED="true";
  const db=await dbFixture();
  try{
    const opts=dependencies(db);
    const plans=(await listSalesPlanCatalog(opts)).plans;
    const editor=(plan:any)=>{
      const {id:_,sortOrder:__,isPublished:___,...draft}=plan;return draft;
    };
    const free=plans.find(p=>p.id==="free")!;
    await assert.rejects(saveDraftSalesPlan("free",{...editor(free),monthlyEurCents:50},
      actor,opts),/price is incompatible/);
    const creator=plans.find(p=>p.id==="creator")!;
    await assert.rejects(saveDraftSalesPlan("creator",{
      ...editor(creator),featureCodes:["not_released_random_feature"]
    },actor,opts),/feature codes are not registered/);
    await db.exec("update public.billing_plans set is_published=true where id='creator'");
    await assert.rejects(saveDraftSalesPlan("creator",editor(creator),actor,opts),
      /Published plans require/);
    await db.exec("update public.billing_plans set is_published=false where id='creator'");
    await db.exec(`insert into public.billing_subscriptions(
       owner_principal,plan_id,billing_interval,status,current_period_start,current_period_end)
       values('legacy:alice','creator','monthly','active',now(),now()+interval '30 days')`);
    await assert.rejects(saveDraftSalesPlan("creator",editor(creator),actor,opts),
      /active subscriptions require/);
    const audits=await db.query<{n:number}>(
      "select count(*)::int as n from public.billing_plan_change_events");
    assert.equal(audits.rows[0].n,0);
  }finally{
    await db.close();
    if(prior===undefined)delete process.env.TGREPOSTER_SALES_PLAN_EDITOR_ENABLED;
    else process.env.TGREPOSTER_SALES_PLAN_EDITOR_ENABLED=prior;
  }
});

test("write service is default disabled before database acquisition",async()=>{
  const prior=process.env.TGREPOSTER_SALES_PLAN_EDITOR_ENABLED;
  delete process.env.TGREPOSTER_SALES_PLAN_EDITOR_ENABLED;
  try {
    await assert.rejects(saveDraftSalesPlan("creator",{},actor,{
      clientFactory:async()=>{throw Error("not allowed");}
    }),/editing is disabled/);
  }finally {
    if(prior!==undefined)process.env.TGREPOSTER_SALES_PLAN_EDITOR_ENABLED=prior;
  }
});
