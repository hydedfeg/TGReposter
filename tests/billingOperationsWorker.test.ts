import test from "node:test";
import assert from "node:assert/strict";
import {
  runBillingOperationsBatch,
  parseBillingBatchSize,
  isBillingWorkerEnabled,
  BILLING_CANDIDATE_QUERIES,
  type BillingStage,
  type BillingCandidate
} from "../server/billing/billingOperationsWorker";

const activeFlags = {
  TGREPOSTER_BILLING_WORKER_ENABLED:"true",
  TGREPOSTER_SUBSCRIPTION_CHECKOUT_ENABLED:"true",
  TGREPOSTER_COMMERCIAL_AI_ENABLED:"true",
  TGREPOSTER_COMMERCIAL_TOPUPS_ENABLED:"true",
};

const ids:Record<BillingStage,string> = {
  subscriptions:"11111111-1111-4111-8111-111111111111",
  topups:"22222222-2222-4222-8222-222222222222",
  renewals:"33333333-3333-4333-8333-333333333333",
  allowances:"44444444-4444-4444-8444-444444444444",
};

const stages:BillingStage[]=["subscriptions","topups","renewals","allowances"];
const candidate=(stage:BillingStage):BillingCandidate=>({
  owner_principal:"supabase:alice",id:ids[stage]
});

test("disabled billing worker makes no queries and cannot fulfill purchases",async()=>{
  let calls=0;
  const report=await runBillingOperationsBatch({
    env:{TGREPOSTER_BILLING_WORKER_ENABLED:"true"},
    listCandidates:async()=>{calls++;return []}
  });
  assert.equal(report.enabled,false);
  assert.equal(calls,0);
  assert.equal(isBillingWorkerEnabled(activeFlags),true);
  assert.equal(isBillingWorkerEnabled({}),false);
});

test("verified subscriptions and renewals are processed BEFORE included AI allocation",async()=>{
  const order:string[]=[];
  const report=await runBillingOperationsBatch({
    env:activeFlags,
    listCandidates:async(stage)=>{
      order.push("list:"+stage);
      return [candidate(stage)];
    },
    fulfillSubscription:async()=>{
      order.push("fulfilled:subscription");
      return {orderId:ids.subscriptions,planId:"creator",interval:"monthly",
        termStart:"2026-10-10T00:00:00Z",termEnd:"2026-11-10T00:00:00Z",
        status:"active",created:true};
    },
    fulfillTopup:async()=>{
      order.push("fulfilled:topup");
      return {orderId:ids.topups,units:"500",fulfilled:true,created:true};
    },
    activateRenewal:async()=>{order.push("activated:renewal");return true},
    grantAllowance:async()=>{
      order.push("granted:ai");
      return {planId:"creator",units:"100",granted:true,
        period:{start:"2026-10-10T00:00:00Z",end:"2026-11-10T00:00:00Z"}};
    },
    clearFailure:async(stage)=>{order.push("cleared:"+stage)},
    noteFailure:async()=>{throw Error("not expected")}
  });
  assert.equal(report.enabled,true);
  assert.deepEqual(report.failureCodes,[]);
  assert.equal(Object.values(report.stages).reduce((sum,s)=>sum+s.completed,0),4);
  assert.ok(order.indexOf("activated:renewal")<order.indexOf("granted:ai"));
  assert.deepEqual(order.filter(x=>x.startsWith("list:")),stages.map(x=>"list:"+x));
});

test("one failed owner does not block other payments or future allowances",async()=>{
  const failures:string[]=[];
  const report=await runBillingOperationsBatch({
    env:activeFlags,
    listCandidates:async(stage)=>stage==="subscriptions"?
      [{...candidate(stage),owner_principal:"legacy:broken"},candidate(stage)]:[],
    fulfillSubscription:async(owner)=>{
      if(owner==="legacy:broken") {
        const error=Object.assign(new Error("Unmatched chain payment"),{code:"PAYMENT_NOT_VERIFIED"});
        throw error;
      }
      return {orderId:ids.subscriptions,planId:"creator",interval:"monthly",
        termStart:"2026-10-10T00:00:00Z",termEnd:"2026-11-10T00:00:00Z",
        status:"active",created:true};
    },
    noteFailure:async(stage,c,code)=>{failures.push(stage+":"+c.owner_principal+":"+code)},
    clearFailure:async()=>{}
  });
  assert.equal(report.stages.subscriptions.attempted,2);
  assert.equal(report.stages.subscriptions.completed,1);
  assert.equal(report.stages.subscriptions.failed,1);
  assert.deepEqual(failures,["subscriptions:legacy:broken:PAYMENT_NOT_VERIFIED"]);
  assert.deepEqual(report.failureCodes,[{stage:"subscriptions",code:"PAYMENT_NOT_VERIFIED"}]);
});

test("disabled top-up and monthly allowance switches exclude those stages",async()=>{
  const listed:BillingStage[]=[];
  const report=await runBillingOperationsBatch({
    env:{TGREPOSTER_BILLING_WORKER_ENABLED:"true",
      TGREPOSTER_SUBSCRIPTION_CHECKOUT_ENABLED:"true"},
    listCandidates:async(stage)=>{listed.push(stage);return []}
  });
  assert.deepEqual(listed,["subscriptions","renewals"]);
  assert.equal(report.stages.topups.attempted,0);
  assert.equal(report.stages.allowances.attempted,0);
});

test("strict worker batch bounds and persisted retry query filters",()=>{
  assert.equal(parseBillingBatchSize(undefined),25);
  assert.equal(parseBillingBatchSize("50"),50);
  for(const raw of ["0","51","4.2","NaN","oops","1000"]) {
    assert.throws(()=>parseBillingBatchSize(raw),/Billing batch size/);
  }
  for(const stage of stages) {
    assert.match(BILLING_CANDIDATE_QUERIES[stage],/billing_operation_attempts/);
    assert.match(BILLING_CANDIDATE_QUERIES[stage],/next_retry_at>now\(\)/);
  }
});
