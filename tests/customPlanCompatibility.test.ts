import test from "node:test";
import assert from "node:assert/strict";
import {PGlite} from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  isCustomPlanId,isPaidPlanCandidate,resolveEffectiveCatalogPlan,
  CUSTOM_PLAN_CHECKOUT_SWITCH,CUSTOM_PLAN_ENTITLEMENT_SWITCH,
  ELIGIBLE_CUSTOM_PLAN_SQL
} from "../server/billing/customPlanEligibility";
import {getEffectivePlanId} from "../server/billing/planCatalog";

const now=new Date("2026-10-19T15:00:00.000Z");
const active={
  planId:"custom_regional_tier",status:"active",
  currentPeriodStart:"2026-10-01T00:00:00.000Z",
  currentPeriodEnd:"2026-11-01T00:00:00.000Z"
};
const gates={
 [CUSTOM_PLAN_CHECKOUT_SWITCH]:"true",
 [CUSTOM_PLAN_ENTITLEMENT_SWITCH]:"true"
};

test("custom tier syntax and checkout gate cannot be bypassed by arbitrary IDs",()=>{
  for(const bad of ["custom_","custom_Aa","custom_a","custom_a-b","custom___","Custom_valid","creator","enterprise","custom_a".repeat(10)]) {
    assert.equal(isCustomPlanId(bad),false,bad);
    assert.equal(isPaidPlanCandidate(bad,gates),bad==="creator");
  }
  assert.equal(isCustomPlanId("custom_regional_tier"),true);
  assert.equal(isPaidPlanCandidate("custom_regional_tier",{}),false);
  assert.equal(isPaidPlanCandidate("custom_regional_tier",gates),true);
  assert.equal(isPaidPlanCandidate("free",gates),false);
  assert.equal(isPaidPlanCandidate("enterprise",gates),false);
  assert.equal(isPaidPlanCandidate("professional",{}),true);
});

test("existing paid term behavior remains unchanged, custom tiers fail without explicit switch",async()=>{
  const unexpected=async()=>{throw Error("Custom catalog must not be queried");};
  assert.equal(getEffectivePlanId(active,now),"free");
  assert.equal(await resolveEffectiveCatalogPlan({...active,planId:"creator"},unexpected,now,{}),"creator");
  assert.equal(await resolveEffectiveCatalogPlan(active,unexpected,now,{}),"free");
  assert.equal(await resolveEffectiveCatalogPlan(null,unexpected,now,gates),"free");
  assert.equal(await resolveEffectiveCatalogPlan({...active,status:"expired"},unexpected,now,gates),"free");
  assert.equal(await resolveEffectiveCatalogPlan({...active,currentPeriodEnd:"2026-10-19T15:00:00.000Z"},unexpected,now,gates),"free");
  assert.equal(await resolveEffectiveCatalogPlan({...active,currentPeriodStart:"not-a-date"},unexpected,now,gates),"free");
  assert.equal(await resolveEffectiveCatalogPlan({...active,planId:"custom_Aa"},unexpected,now,gates),"free");
});

test("explicit gate plus DB row required for custom effective-plan entitlement",async()=>{
  let n=0;
  const query=async(sql:string,params:unknown[])=>{
    n++;
    assert.equal(sql,ELIGIBLE_CUSTOM_PLAN_SQL);
    assert.deepEqual(params,["custom_regional_tier"]);
    return {rows:[{
      id:"custom_regional_tier",is_published:true,is_enabled:true,
      monthly_eur_cents:1200,annual_eur_cents:12000
    }]};
  };
  assert.equal(await resolveEffectiveCatalogPlan(active,query,now,gates),"custom_regional_tier");
  assert.equal(n,1);
  for(const patch of [
    {is_published:false},{is_enabled:false},{monthly_eur_cents:0},
    {annual_eur_cents:null},{id:"custom_another_plan"}
  ]){
    const safe=await resolveEffectiveCatalogPlan(active,async()=>({
      rows:[{id:"custom_regional_tier",is_published:true,is_enabled:true,
        monthly_eur_cents:1200,annual_eur_cents:12000,...patch}]
    }),now,gates);
    assert.equal(safe,"free");
  }
  assert.equal(await resolveEffectiveCatalogPlan(active,async()=>({rows:[]}),now,gates),"free");
});

test("real draft-only PostgreSQL check makes custom entitlement impossible even when flags are supplied",async()=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
  const db=new PGlite();
  try{
    await db.exec("create role anon; create role authenticated; create role service_role;");
    for(const file of [
      "20261012144506_create_commercial_foundation.sql",
      "20261019140859_sales_plan_management.sql",
      "20261019173245_custom_sales_plan_drafts.sql"
    ]) {
      await db.exec(fs.readFileSync(path.join(root,"supabase/migrations",file),"utf8"));
    }
    await db.exec(`
      insert into public.billing_plans (
        id,display_name,sort_order,monthly_eur_cents,annual_eur_cents,
        max_users,max_sources,max_destinations,max_active_campaigns,
        history_days,monthly_ai_units,monitoring_priority,support_tier,
        is_enabled,is_published
      ) values (
        'custom_regional_tier','Regional',99,1200,12000,1,5,2,1,
        30,100,'standard','community',false,false
      )`);
    const query=(sql:string,params:unknown[])=>db.query(sql,params as any[]);
    assert.equal(await resolveEffectiveCatalogPlan(active,query,now,gates),"free");
    await db.exec("update public.billing_plans set is_enabled=true where id='custom_regional_tier'");
    assert.equal(await resolveEffectiveCatalogPlan(active,query,now,gates),"free");
    await assert.rejects(db.exec(
      "update public.billing_plans set is_published=true where id='custom_regional_tier'"
    ),/billing_plans_custom_draft_only_check/);
    assert.equal(await resolveEffectiveCatalogPlan(active,query,now,gates),"free");
    const result=await db.query<{n:number}>(
      "select count(*)::int as n from public.billing_plans where id like 'custom_%' and is_published=true");
    assert.equal(result.rows[0].n,0);
  }finally{await db.close();}
});
