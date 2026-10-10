import test from "node:test";
import assert from "node:assert/strict";
import {
  getBillingOverview, normalizeBillingOwner,
  BILLING_USAGE_QUERY, BILLING_AI_QUERY, BILLING_ORDERS_QUERY
} from "../server/billing/billingOverviewService";

function fakeBillingQuery(calls: Array<{ sql: string; params: unknown[] }>) {
  return async (sql: string, params: unknown[]) => {
    calls.push({sql,params});
    if(sql.includes("from public.billing_subscriptions")) {
      return {rows:[{
        plan_id:"professional",status:"active",billing_interval:"monthly",
        current_period_start:"2026-10-01T00:00:00Z",
        current_period_end:"2026-11-01T00:00:00Z",
        cancel_at_period_end:false
      }]};
    }
    if(sql.includes("from public.billing_plans")) {
      return {rows:[{
        id:"professional",display_name:"Professional",is_published:true,
        monthly_eur_cents:3900,annual_eur_cents:39000,
        max_users:3,max_sources:75,max_destinations:15,
        max_active_campaigns:10,history_days:365,monthly_ai_units:"400.000000"
      }]};
    }
    if(sql.includes("from public.billing_plan_features")) {
      return {rows:[{feature_code:"content_inbox"},{feature_code:"ai_processing"}]};
    }
    if(sql===BILLING_USAGE_QUERY) {
      return {rows:[{sources:7,destinations:3,active_campaigns:2}]};
    }
    if(sql===BILLING_AI_QUERY) {
      return {rows:[{included_available:"285.250000",included_granted:"400.000000",
        purchased_available:"1000.500000",included_period_end:"2026-11-01T00:00:00Z"}]};
    }
    if(sql===BILLING_ORDERS_QUERY) {
      return {rows:[{id:"00000000-0000-0000-0000-000000000001",
        type:"subscription",description:"Professional (monthly)",status:"fulfilled",
        payment_status:"paid",listed_eur_cents:3900,created_at:"2026-10-01T00:00:00Z"}]};
    }
    throw Error("Unexpected SQL query");
  };
}

test("customer billing overview uses only trusted owner for every private query",async()=>{
  const calls: Array<{sql:string;params:unknown[]}> = [];
  const overview=await getBillingOverview("supabase:ALICE-ID",{
    query:fakeBillingQuery(calls),
    now:new Date("2026-10-10T12:00:00Z")
  });
  assert.equal(overview.availability,"active");
  assert.equal(overview.plan.id,"professional");
  assert.equal(overview.plan.monthlyEurCents,3900);
  assert.deepEqual(overview.usage,{sources:7,destinations:3,activeCampaigns:2,users:null});
  assert.equal(overview.ai.includedAvailable,"285.250000");
  assert.equal(overview.orders.length,1);
  assert.equal(overview.orders[0].paymentStatus,"paid");
  const ownerQueries=calls.filter(({sql})=>!sql.includes("from public.billing_plans")
      && !sql.includes("from public.billing_plan_features"));
  assert.equal(ownerQueries.length,4);
  assert.ok(ownerQueries.every(({params})=>params.length===1 && params[0]==="supabase:alice-id"));
  assert.ok(calls.every(({sql})=>!sql.includes("select *")));
});

test("expired or canceled subscriptions fall back to Free rather than showing an active paid plan",async()=>{
  const calls:Array<{sql:string;params:unknown[]}>=[];
  const original=fakeBillingQuery(calls);
  const result=await getBillingOverview("legacy:alice",{
    now:new Date("2026-12-01T00:00:00Z"),
    query:async (sql,params)=>{
      if(sql.includes("from public.billing_plans")) {
        assert.deepEqual(params,["free"]);
        return {rows:[{id:"free",display_name:"Free",is_published:false,
          monthly_eur_cents:0,annual_eur_cents:0,max_users:1,
          max_sources:3,max_destinations:1,max_active_campaigns:0,
          history_days:7,monthly_ai_units:"10"}]};
      }
      return original(sql,params);
    }
  });
  assert.equal(result.plan.id,"free");
  assert.equal(result.availability,"prelaunch");
  assert.equal(result.subscription?.status,"active");
  assert.equal(result.subscription?.periodEnd,"2026-11-01T00:00:00.000Z");
});

test("untrusted billing owners and read-scope omissions are rejected",()=>{
  for(const value of ["","alice"," legacy: ","bob and 1=1","supabase:alice bob"]) {
    assert.throws(()=>normalizeBillingOwner(value));
  }
  assert.match(BILLING_USAGE_QUERY,/owner_principal=\$1/g);
  assert.match(BILLING_AI_QUERY,/owner_principal=\$1/);
  assert.match(BILLING_ORDERS_QUERY,/where o.owner_principal=\$1/g);
  assert.match(BILLING_ORDERS_QUERY,/limit 12/);
});

test("missing commercial catalog never produces fabricated Free balances",async()=>{
  await assert.rejects(getBillingOverview("legacy:alice",{
    now:new Date("2026-10-10T12:00:00Z"),
    query:async (sql)=>sql.includes("from public.billing_plans")
      ? {rows:[]} : {rows:[]}
  }),/catalog is not installed/);
});
