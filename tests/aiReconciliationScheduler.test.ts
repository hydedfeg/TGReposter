import test from "node:test";
import assert from "node:assert/strict";
import {
  startAiReconciliationScheduler,
  isAiReconciliationSchedulerEnabled,
  aiReconciliationInterval,
  aiReconciliationBatchSize,
  runAiReconciliationWithAdvisoryLock
} from "../server/billing/openRouterReconciliationScheduler";
import {
  fetchGenerationCost,reconcilePendingOpenRouterUsage
} from "../server/billing/openRouterReconciliation";

const enabled = {
  TGREPOSTER_AI_RECONCILIATION_ENABLED:"true",
  TGREPOSTER_COMMERCIAL_AI_ENABLED:"true",
  DATABASE_URL:"postgresql://fake.invalid/tgreposter",
  TGREPOSTER_OPENROUTER_API_KEY:"SYNTHETIC_PROVIDER_KEY"
};
const noLog={info(){},warn(){},error(){}};

test("AI reconciliation scheduler is off without independent launch switches, database and server key",async()=>{
  for (const env of [
    {},
    {...enabled,TGREPOSTER_AI_RECONCILIATION_ENABLED:"false"},
    {...enabled,TGREPOSTER_COMMERCIAL_AI_ENABLED:"false"},
    {...enabled,TGREPOSTER_OPENROUTER_API_KEY:"  "},
    {...enabled,DATABASE_URL:""}
  ]) {
    assert.equal(isAiReconciliationSchedulerEnabled(env),false);
    let timers=0;
    const stop=startAiReconciliationScheduler({
      env,runLocked:async()=>{throw Error("Not allowed to run");},
      setIntervalFn:()=>{timers++;return {};},
      logger:noLog
    });
    stop();assert.equal(timers,0);
    const locked=await runAiReconciliationWithAdvisoryLock(env);
    assert.deepEqual(locked,{acquired:false});
  }
  assert.equal(isAiReconciliationSchedulerEnabled(enabled),true);
});

test("AI reconciliation interval and batch sizes enforce conservative bounded work",()=>{
  assert.equal(aiReconciliationInterval(),900_000);
  assert.equal(aiReconciliationInterval("1800000"),1_800_000);
  assert.equal(aiReconciliationBatchSize(),10);
  assert.equal(aiReconciliationBatchSize("20"),20);
  for(const s of ["0","999","60000","5.5","NaN","999999999"]) {
    assert.throws(()=>aiReconciliationInterval(s),/Invalid AI reconciliation interval/);
  }
  for(const s of ["0","21","-1","1.5","foo"]) {
    assert.throws(()=>aiReconciliationBatchSize(s),/Invalid AI reconciliation batch size/);
  }
});

test("scheduler runs once, records only aggregate metrics and stops safely",async()=>{
  let cycles=0;
  let fn:(()=>void)|undefined;
  let stopped=0;
  let logged="";let metrics:any;
  const stop=startAiReconciliationScheduler({
    env:enabled,
    runLocked:async()=>{
      cycles++;
      return {acquired:true,report:{checked:2,settled:1,unresolved:1}};
    },
    setIntervalFn:(callback,ms)=>{
      assert.equal(ms,900_000);
      fn=callback;return {unref(){}};
    },
    clearIntervalFn:()=>{stopped++;},
    logger:{
      info(){},
      warn(message,meta){logged=message;metrics=meta;},
      error(){}
    }
  });
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(cycles,1);
  assert.match(logged,/unresolved/);
  assert.deepEqual(metrics,{checked:2,settled:1,unresolved:1});
  fn?.();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(cycles,2);
  stop();stop();fn?.();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(cycles,2);
  assert.equal(stopped,1);
});

test("scheduler never runs overlapping iterations or logs secrets from errors",async()=>{
  let calls=0;
  let release!:()=>void;
  const blocker=new Promise<void>(resolve=>{release=resolve});
  let fn:(()=>void)|undefined;
  let lastError:any;
  const stop=startAiReconciliationScheduler({
    env:enabled,
    runLocked:async()=>{calls++;await blocker;throw Object.assign(
      Error("SYNTHETIC_PROVIDER_KEY private data"),{code:"PROVIDER_TIMEOUT"});
    },
    setIntervalFn:(callback)=>{fn=callback;return {};},
    logger:{info(){},warn(){},error(_message,meta){lastError=meta;}}
  });
  fn?.();fn?.();
  assert.equal(calls,1);
  release();
  await new Promise(resolve=>setImmediate(resolve));
  stop();
  assert.deepEqual(lastError,{code:"PROVIDER_TIMEOUT"});
  assert.ok(!JSON.stringify(lastError).includes("SYNTHETIC_PROVIDER_KEY"));
});

const rows=[{owner_principal:"legacy:alice",request_key:"request-one",
  provider_generation_id:"gen-valid123"}];

test("AI reconciliation atomically claims a due row before looking up and settling authoritative cost",async()=>{
  const actions:string[]=[];
  let checkSql="";
  let claimSql="";
  const report=await reconcilePendingOpenRouterUsage({
    env:{TGREPOSTER_COMMERCIAL_AI_ENABLED:"true"},
    apiKey:enabled.TGREPOSTER_OPENROUTER_API_KEY,
    limit:10,
    query:async (sql,params)=>{
      if(sql.includes("select owner_principal")){
        checkSql=sql;
        assert.deepEqual(params,[10]);
        return {rows};
      }
      claimSql=sql;
      assert.deepEqual(params,["legacy:alice","request-one","gen-valid123"]);
      actions.push("claim");
      return {rows:[{id:"req-id"}]};
    },
    fetchGeneration:async(id,key)=>{
      actions.push("lookup");
      assert.equal(id,"gen-valid123");
      assert.equal(key,"SYNTHETIC_PROVIDER_KEY");
      return {generationId:id,costUsd:"0.0150000000",promptTokens:25,completionTokens:45};
    },
    settle:async input=>{
      actions.push("settle");
      assert.equal(input.status,"failed");
      assert.equal(input.ownerPrincipal,"legacy:alice");
      assert.equal(input.requestKey,"request-one");
      assert.equal(input.actualCostUsd,"0.0150000000");
      return {requestId:"req-id",chargedUnits:"1.500000",settled:true};
    },
    flag:async()=>{throw Error("must not flag success");}
  });
  assert.deepEqual(actions,["claim","lookup","settle"]);
  assert.deepEqual(report,{checked:1,settled:1,unresolved:0});
  assert.match(checkSql,/reconciliation_next_attempt_at <= now\(\)/);
  assert.match(checkSql,/provider_generation_id is not null/);
  assert.match(claimSql,/reconciliation_attempts=reconciliation_attempts\+1/);
  assert.match(claimSql,/reconciliation_next_attempt_at/);
});

test("already claimed rows are not looked up, charged or settled again",async()=>{
  let fetchCalls=0;
  const report=await reconcilePendingOpenRouterUsage({
    env:{TGREPOSTER_COMMERCIAL_AI_ENABLED:"true"},
    apiKey:enabled.TGREPOSTER_OPENROUTER_API_KEY,
    query:async sql=>({rows:sql.includes("select owner_principal")?rows:[]}),
    fetchGeneration:async()=>{fetchCalls++;throw Error("Duplicate lookup");},
    settle:async()=>{throw Error("Duplicate settle");}
  });
  assert.deepEqual(report,{checked:0,settled:0,unresolved:0});
  assert.equal(fetchCalls,0);
});

test("unknown cost and settlement failure retain holds with sanitized operator notes",async()=>{
  for(const failAt of ["lookup","settlement"] as const){
    let note="";
    let settlements=0;
    const report=await reconcilePendingOpenRouterUsage({
      env:{TGREPOSTER_COMMERCIAL_AI_ENABLED:"true"},
      apiKey:enabled.TGREPOSTER_OPENROUTER_API_KEY,
      query:async sql=>({rows:sql.includes("select owner_principal")?rows:[{id:"req-id"}]}),
      fetchGeneration:async id=>{
        if(failAt==="lookup")throw Error("Sensitive customer prompt and secret token");
        return {generationId:id,costUsd:"0.0050000000",promptTokens:10,completionTokens:10};
      },
      settle:async()=>{
        settlements++;
        throw Error("Sensitive database internal failure");
      },
      flag:async(owner,key,reason,generation)=>{
        assert.equal(owner,"legacy:alice");
        assert.equal(key,"request-one");
        assert.equal(generation,"gen-valid123");
        note=reason;
      }
    });
    assert.deepEqual(report,{checked:1,settled:0,unresolved:1});
    assert.equal(settlements,failAt==="lookup"?0:1);
    assert.equal(note,failAt==="lookup"
      ?"AI_GENERATION_COST_RETRY_PENDING":"AI_SETTLEMENT_REVIEW_REQUIRED");
    assert.ok(!note.includes("Sensitive"));
  }
});

test("generation lookup deadline also stops adapters that ignore AbortSignal",async()=>{
  let capturedSignal:AbortSignal|undefined;
  await assert.rejects(fetchGenerationCost("gen-valid123","SYNTHETIC_PROVIDER_KEY",
    async (_url,init)=>{
      capturedSignal=init?.signal as AbortSignal;
      return new Promise<Response>(()=>{});
    },12
  ),/timed out/);
  assert.equal(capturedSignal?.aborted,true);
  await assert.rejects(fetchGenerationCost("gen-valid123","KEY",
    async()=>new Response("{}",{status:200}),0),/Invalid generation lookup timeout/);
});
