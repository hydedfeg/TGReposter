import test from "node:test";
import assert from "node:assert/strict";
import {
  isCommercialCurationRouteEnabled,
  runCustomerCommercialCuration,
  CustomerCommercialCurationError
} from "../server/billing/customerCommercialCuration";
import { AIGrantError } from "../server/billing/monthlyAIAllowance";
import { CommercialAIError } from "../server/billing/commercialOpenRouterService";

const enabled = {
  TGREPOSTER_COMMERCIAL_AI_ENABLED: "true",
  TGREPOSTER_COMMERCIAL_AI_ROUTE_ENABLED: "true",
  DATABASE_URL: "postgresql://synthetic.invalid:5432/testing"
};
const input = {
  user: {authProvider:"supabase",id:"6d3d04dc-18c1-497d-b6f4-d7162fbca440",username:"alice"},
  provider:"openrouter",
  modelId:"test-model/text",
  action:"rephrase" as const,
  prompt:"Rewrite this Telegram post",
  idempotencyKey:"018bf4a1-3ac0-4e90-a1b4-b3cfc1386e66"
};
const period={
  planId:"creator",units:"100.000000",granted:false,
  period:{start:"2026-10-01T00:00:00.000Z",end:"2026-11-01T00:00:00.000Z"}
};

test("commercial AI route requires separately enabled server switches and a database",()=>{
  assert.equal(isCommercialCurationRouteEnabled({}),false);
  assert.equal(isCommercialCurationRouteEnabled({
    ...enabled,TGREPOSTER_COMMERCIAL_AI_ROUTE_ENABLED:"false"
  }),false);
  assert.equal(isCommercialCurationRouteEnabled({
    ...enabled,TGREPOSTER_COMMERCIAL_AI_ENABLED:"false"
  }),false);
  assert.equal(isCommercialCurationRouteEnabled({...enabled,DATABASE_URL:""}),false);
  assert.equal(isCommercialCurationRouteEnabled(enabled),true);
});

test("disabled path and unsupported provider cannot grant or charge AI Units",async()=>{
  const calls:string[]=[];
  const deps={
    ensureAllowance:async()=>{calls.push("grant");return period;},
    curate:async()=>{calls.push("provider");return {
      text:"Edited",modelId:"test-model/text",chargedUnits:"2.000000"
    };}
  };
  await assert.rejects(
    runCustomerCommercialCuration(input,{...deps,env:{}}),
    (err:unknown)=>err instanceof CustomerCommercialCurationError
      && err.status===503 && err.code==="COMMERCIAL_AI_DISABLED");
  await assert.rejects(
    runCustomerCommercialCuration({...input,provider:"gemini"},{...deps,env:enabled}),
    (err:unknown)=>err instanceof CustomerCommercialCurationError
      && err.status===409 && err.code==="AI_PROVIDER_NOT_SUPPORTED");
  await assert.rejects(
    runCustomerCommercialCuration({...input,user:null},{...deps,env:enabled}),
    (err:unknown)=>err instanceof CustomerCommercialCurationError
      && err.status===401 && err.code==="AI_AUTH_REQUIRED");
  await assert.rejects(
    runCustomerCommercialCuration({...input,idempotencyKey:"reused"},{...deps,env:enabled}),
    (err:unknown)=>err instanceof CustomerCommercialCurationError
      && err.status===400 && err.code==="INVALID_AI_REQUEST_KEY");
  assert.deepEqual(calls,[]);
});

test("authenticated owner, allowance period and request key reach the balance reservation path",async()=>{
  const steps:string[]=[];
  const result=await runCustomerCommercialCuration(input,{
    env:enabled,
    ensureAllowance:async(owner)=>{
      steps.push("allowance");
      assert.equal(owner,"supabase:6d3d04dc-18c1-497d-b6f4-d7162fbca440");
      return period;
    },
    curate:async(request)=>{
      steps.push("curation");
      assert.equal(request.ownerPrincipal,"supabase:6d3d04dc-18c1-497d-b6f4-d7162fbca440");
      assert.equal(request.requestKey,input.idempotencyKey);
      assert.equal(request.periodStart,period.period.start);
      assert.equal(request.periodEnd,period.period.end);
      assert.equal(request.operation,"rephrase");
      assert.equal(request.modelId,"test-model/text");
      assert.equal(request.prompt,input.prompt);
      return {text:"Edited",modelId:request.modelId,chargedUnits:"1.250000"};
    }
  });
  assert.deepEqual(steps,["allowance","curation"]);
  assert.deepEqual(result,{
    result:"Edited",billingMode:"included",chargedUnits:"1.250000",modelId:"test-model/text"
  });
});

test("identity remains isolated for distinct authenticated users",async()=>{
  const seen:string[]=[];
  for(const username of ["alice","bob"]){
    const user={authProvider:"legacy",username};
    await runCustomerCommercialCuration({...input,user},{
      env:enabled,
      ensureAllowance:async(owner)=>{seen.push(owner);return period;},
      curate:async(req)=>{
        assert.equal(req.ownerPrincipal,"legacy:"+username);
        return {text:"Edited",chargedUnits:"0.500000",modelId:req.modelId};
      }
    });
  }
  assert.deepEqual(seen,["legacy:alice","legacy:bob"]);
});

test("unpublished Free plan fails closed, without calling OpenRouter",async()=>{
  let providerCalled=false;
  await assert.rejects(runCustomerCommercialCuration(input,{
    env:enabled,
    ensureAllowance:async()=>{throw new AIGrantError("PLAN_NOT_AVAILABLE","Not published");},
    curate:async()=>{providerCalled=true;throw Error("must not run");}
  }),(err:unknown)=>err instanceof CustomerCommercialCurationError
     && err.status===503 && err.code==="PLAN_NOT_AVAILABLE");
  assert.equal(providerCalled,false);
});

test("insufficient credit and duplicate reservations reject safely",async()=>{
  for(const [code,status] of [
    ["AI_BALANCE_EXHAUSTED",402],
    ["DUPLICATE_AI_REQUEST",409]
  ] as const){
    await assert.rejects(runCustomerCommercialCuration(input,{
      env:enabled,
      ensureAllowance:async()=>period,
      curate:async()=>{throw new CommercialAIError(status,code,"Unable to charge AI Units.");}
    }),(err:unknown)=>err instanceof CustomerCommercialCurationError
       && err.code===code && err.status===status);
  }
});

test("internal provider errors do not leak raw service diagnostics",async()=>{
  await assert.rejects(runCustomerCommercialCuration(input,{
    env:enabled,
    ensureAllowance:async()=>period,
    curate:async()=>{throw new CommercialAIError(502,"AI_PROVIDER_ERROR","sensitive diagnostic");}
  }),(err:unknown)=>err instanceof CustomerCommercialCurationError
     && err.status===502
     && err.code==="AI_PROVIDER_ERROR"
     && !err.message.includes("sensitive"));
});
