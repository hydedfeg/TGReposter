import test from "node:test";
import assert from "node:assert/strict";
import {
  requirePlanCapacity, PlanCapacityError,
  PLAN_CAPACITY_USAGE_SQL, ENTITLEMENT_SWITCH,
} from "../server/billing/backendEntitlementGuard";

const owner="legacy:alice";
const now=new Date("2026-10-19T13:30:00.000Z");
const on={ [ENTITLEMENT_SWITCH]:"true" };
const off={};
const paid={
  plan_id:"creator",status:"active",
  current_period_start:"2026-10-01T00:00:00.000Z",
  current_period_end:"2026-11-01T00:00:00.000Z"
};
type Options={
  subscription?:Record<string,unknown>|null;
  freeLimit?:{max_sources:number;max_destinations:number;max_active_campaigns:number};
  paidLimit?:{max_sources:number|null;max_destinations:number|null;max_active_campaigns:number|null};
  usage?:{sources:number;destinations:number;active_campaigns:number};
  failAt?:number;
};
function fixture(opts:Options={}){
  const calls:Array<{sql:string;params:unknown[]}>=[];let nth=0;
  const query=async(sql:string,params:unknown[])=>{
    calls.push({sql,params});nth++;
    if(nth===opts.failAt)throw Object.assign(new Error("secret PII in DB error"),{code:"XX000"});
    if(sql.includes("from public.billing_subscriptions"))return {rows:opts.subscription===null?[]:[opts.subscription??paid]};
    if(sql.includes("from public.billing_plans")){
      const expected=params[0];
      if(expected==="creator")return {rows:[opts.paidLimit??{
        max_sources:15,max_destinations:3,max_active_campaigns:1
      }]};
      if(expected==="free")return {rows:[opts.freeLimit??{
        max_sources:3,max_destinations:1,max_active_campaigns:0
      }]};
      return {rows:[]};
    }
    if(sql.includes("from public.source_channels"))return {rows:[opts.usage??{
      sources:2,destinations:1,active_campaigns:0
    }]};
    throw Error("Unexpected SQL");
  };
  return {query,calls};
}

test("disabled entitlement guard performs zero database reads",async()=>{
  const f=fixture({failAt:1});
  await requirePlanCapacity(owner,"sources",99,{env:off,query:f.query,at:now});
  assert.deepEqual(f.calls,[]);
});

test("paid plan allows capacities below limit and blocks growth at cap",async()=>{
  const f=fixture({usage:{sources:14,destinations:2,active_campaigns:0}});
  await requirePlanCapacity(owner,"sources",1,{env:on,query:f.query,at:now});
  await requirePlanCapacity(owner,"destinations",1,{env:on,query:f.query,at:now});
  await requirePlanCapacity(owner,"activeCampaigns",1,{env:on,query:f.query,at:now});
  await assert.rejects(
    requirePlanCapacity(owner,"sources",2,{env:on,query:f.query,at:now}),
    e=>{
      assert.ok(e instanceof PlanCapacityError);
      assert.equal(e.code,"PLAN_LIMIT_REACHED");
      assert.equal(e.status,409);
      assert.equal(e.kind,"sources");
      assert.equal(e.planId,"creator");
      assert.equal(e.limit,15);
      assert.doesNotMatch(e.message,/alice|source_channels|secret/i);
      return true;
    }
  );
  assert.ok(f.calls.every(x=>x.params[0]===owner||["creator","free"].includes(String(x.params[0]))));
});

test("expired or non-active subscription uses Free limits and blocks zero campaign capacity",async()=>{
  for(const subscription of [
    {...paid,status:"expired"},
    {...paid,status:"paused"},
    {...paid,status:"past_due"},
    {...paid,current_period_end:"2026-10-19T13:00:00Z"},
    {...paid,current_period_start:"2026-10-20T00:00:00Z"}
  ]){
    const f=fixture({subscription});
    await assert.rejects(
      requirePlanCapacity(owner,"activeCampaigns",1,{env:on,query:f.query,at:now}),
      e=>e instanceof PlanCapacityError && e.planId==="free" && e.limit===0
    );
    assert.ok(f.calls.some(x=>x.sql.includes("from public.billing_plans")&&x.params[0]==="free"));
  }
  const missing=fixture({subscription:null});
  await assert.rejects(
    requirePlanCapacity(owner,"activeCampaigns",1,{env:on,query:missing.query,at:now}),
    {code:"PLAN_LIMIT_REACHED",planId:"free"}
  );
});

test("re-enabling extra destinations must include BOTH personal and promotional targets",async()=>{
  assert.match(PLAN_CAPACITY_USAGE_SQL,/public\.destination_targets/);
  assert.match(PLAN_CAPACITY_USAGE_SQL,/public\.promotion_targets/);
  assert.match(PLAN_CAPACITY_USAGE_SQL,/owner_principal=\$1/g);
  const f=fixture({usage:{sources:2,destinations:3,active_campaigns:0}});
  await assert.rejects(
    requirePlanCapacity(owner,"destinations",1,{env:on,query:f.query,at:now}),
    {code:"PLAN_LIMIT_REACHED",limit:3}
  );
});

test("unlimited Enterprise capacity supports null values without usage queries",async()=>{
  const f=fixture({
    subscription:{...paid,plan_id:"enterprise"},
    failAt:3
  });
  const query=async(sql:string,params:unknown[])=>{
    if(sql.includes("from public.billing_plans"))
      return {rows:[{max_sources:null,max_destinations:null,max_active_campaigns:null}]};
    return f.query(sql,params);
  };
  await requirePlanCapacity(owner,"sources",1,{env:on,query,at:now});
  assert.equal(f.calls.length,1); // Only subscription; no usage table read.
});

test("enabled guard fails closed on missing plan, query errors or malformed counts",async()=>{
  const fails=fixture({failAt:2});
  await assert.rejects(
    requirePlanCapacity(owner,"sources",1,{env:on,query:fails.query,at:now}),
    /secret PII in DB error/
  );
  const bad=fixture({usage:{sources:-1,destinations:0,active_campaigns:0}});
  await assert.rejects(
    requirePlanCapacity(owner,"sources",1,{env:on,query:bad.query,at:now}),
    /Invalid billing usage/
  );
  const ignored=fixture();
  await requirePlanCapacity(owner,"sources",0,{env:on,query:ignored.query,at:now});
  assert.deepEqual(ignored.calls,[]);
  await assert.rejects(
    requirePlanCapacity("invalid","sources",1,{env:on,query:ignored.query,at:now}),
    /Valid authenticated billing owner/
  );
});
