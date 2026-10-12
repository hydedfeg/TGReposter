import test from "node:test";
import assert from "node:assert/strict";
import {
  computePlanChangeEstimate,getPlanChangePreview,PlanChangePreviewError,
  PLAN_CHANGE_SNAPSHOT_SQL,PLAN_CHANGE_CATALOG_SQL,PLAN_CHANGE_CONFLICT_SQL
} from "../server/billing/planChangePreview";

const jan="2026-10-01T00:00:00Z";
const nov="2026-11-01T00:00:00Z";
const halfway=new Date((Date.parse(jan)+Date.parse(nov))/2);

test("half-used Creator→Professional month yields 12 EUR estimated difference",()=>{
  const out=computePlanChangeEstimate({
    currentPriceCents:1500,targetPriceCents:3900,
    periodStart:jan,periodEnd:nov,now:halfway
  });
  assert.equal(out.direction,"upgrade");
  assert.equal(out.estimatedAdditionalCents,1200);
  assert.equal(out.remainingPeriodRatio.remainingMs*2,out.remainingPeriodRatio.totalMs);
});

test("partial cents round upwards; estimate can never become negative",()=>{
  const result=computePlanChangeEstimate({
    currentPriceCents:1500,targetPriceCents:3900,
    periodStart:jan,periodEnd:nov,
    now:new Date(Date.parse(nov)-1)
  });
  assert.equal(result.estimatedAdditionalCents,1);
  const down=computePlanChangeEstimate({
    currentPriceCents:3900,targetPriceCents:1500,
    periodStart:jan,periodEnd:nov,now:halfway
  });
  assert.equal(down.direction,"downgrade");
  assert.equal(down.estimatedAdditionalCents,0);
});

test("invalid or already-ended periods fail closed",()=>{
  for(const time of ["2026-09-30T23:59:59Z",nov]) {
    assert.throws(()=>computePlanChangeEstimate({
      currentPriceCents:1500,targetPriceCents:3900,
      periodStart:jan,periodEnd:nov,now:new Date(time)
    }),/No active paid term/);
  }
  assert.throws(()=>computePlanChangeEstimate({
    currentPriceCents:1500,targetPriceCents:1500,
    periodStart:jan,periodEnd:nov,now:halfway
  }),/same price/);
});

function fixtures(calls:Array<{sql:string;params:unknown[]}>,change:{
  pending?:boolean;prepaid?:boolean;status?:string;cancel?:boolean;published?:boolean;
}={}) {
  return async(sql:string,params:unknown[])=>{
    calls.push({sql,params});
    if(sql===PLAN_CHANGE_SNAPSHOT_SQL) return {rows:[{
      plan_id:"creator",status:change.status??"active",
      billing_interval:"monthly",
      current_period_start:jan,current_period_end:nov,
      cancel_at_period_end:change.cancel??false
    }]};
    if(sql===PLAN_CHANGE_CONFLICT_SQL) return {rows:[{
      prepaid_renewal:change.prepaid??false,
      unresolved_payment:change.pending??false
    }]};
    if(sql===PLAN_CHANGE_CATALOG_SQL) return {rows:[
      {id:"creator",is_published:change.published??true,
       monthly_eur_cents:1500,annual_eur_cents:15000},
      {id:"professional",is_published:change.published??true,
       monthly_eur_cents:3900,annual_eur_cents:39000}
    ]};
    throw Error("Unexpected SQL");
  };
}

test("preview is session-owner scoped and cannot activate checkout",async()=>{
  const calls:Array<{sql:string;params:unknown[]}>=[];
  const result=await getPlanChangePreview("LEGACY:ALICE","professional",{
    enabled:true,now:halfway,query:fixtures(calls)
  });
  assert.equal(result.kind,"non_binding_estimate");
  assert.equal(result.estimatedAdditionalCents,1200);
  assert.equal(result.estimatedRefundCents,0);
  assert.equal(result.checkoutEnabled,false);
  assert.equal(result.policyStatus,"requires_approval");
  assert.equal(result.effectiveAt,halfway.toISOString());
  assert.equal(calls.length,3);
  assert.deepEqual(calls[0].params,["legacy:alice"]);
  assert.deepEqual(calls[1].params,["legacy:alice"]);
  assert.deepEqual(calls[2].params,["creator","professional"]);
  assert.ok(calls.every(c=>/^\s*select\b/i.test(c.sql)));
});

test("unsettled payments, paid future renewals and cancellation block estimates",async()=>{
  for(const flag of [{pending:true},{prepaid:true},{cancel:true},{status:"expired"}]){
    const calls:Array<{sql:string;params:unknown[]}>=[];
    await assert.rejects(getPlanChangePreview("legacy:alice","professional",{
      enabled:true,now:halfway,query:fixtures(calls,flag)
    }),e=>e instanceof PlanChangePreviewError
      && ["PAYMENT_REVIEW_REQUIRED","NO_ELIGIBLE_SUBSCRIPTION"].includes(e.code));
  }
});

test("unpublished target plans cannot be quoted and no owner override is accepted",async()=>{
  await assert.rejects(getPlanChangePreview("legacy:alice","professional",{
    enabled:true,now:halfway,query:fixtures([],{published:false})
  }),/Both plans must be published/);
  for(const id of ["free","enterprise","creator","__proto__",""]) {
    await assert.rejects(getPlanChangePreview("legacy:alice",id,{
      enabled:true,now:halfway,query:fixtures([])
    }));
  }
  await assert.rejects(getPlanChangePreview("legacy:bob&owner=legacy:alice","professional",{
    enabled:true,now:halfway,query:fixtures([])
  }),/Valid authenticated billing owner/);
});

test("preview is disabled by default and touches no database when unavailable",async()=>{
  const prior=process.env.TGREPOSTER_PLAN_CHANGE_PREVIEW_ENABLED;
  delete process.env.TGREPOSTER_PLAN_CHANGE_PREVIEW_ENABLED;
  try{
    await assert.rejects(getPlanChangePreview("legacy:alice","professional",{
      query:async()=>{throw Error("must not query");}
    }),/not launched/);
  }finally{
    if(prior===undefined) delete process.env.TGREPOSTER_PLAN_CHANGE_PREVIEW_ENABLED;
    else process.env.TGREPOSTER_PLAN_CHANGE_PREVIEW_ENABLED=prior;
  }
});
