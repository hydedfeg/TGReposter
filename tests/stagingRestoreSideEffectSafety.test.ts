import test from "node:test";
import assert from "node:assert/strict";
import {evaluateRestoreSideEffectSafety} from "../scripts/stagingRestoreSideEffectSafety";

const clear=()=>({cronInstalled:true,netInstalled:true,activeCronJobs:0,
 activeHttpCronJobs:0,queuedHttpRequests:0,publicTablesWithoutRls:0,
 anonymousReadablePublicTables:0,authenticatedReadableSensitiveTables:0,
 anonymousExecutableDefinerFunctions:0});
test("fully isolated restored copy passes side-effect gate",()=>{
 assert.deepEqual(evaluateRestoreSideEffectSafety(clear()),[]);
});
test("source-like active cron and external cron fail",()=>{
 const s=clear();s.activeCronJobs=2;s.activeHttpCronJobs=1;
 const e=evaluateRestoreSideEffectSafety(s).join(";");
 assert.match(e,/active cron jobs/);assert.match(e,/outbound HTTP cron/);
});
test("queued pg_net requests block acceptance",()=>{
 const s=clear();s.queuedHttpRequests=1;
 assert.match(evaluateRestoreSideEffectSafety(s).join(";"),/pending pg_net/);
});
test("missing pg_net or pg_cron fails closed",()=>{
 const s=clear();s.cronInstalled=false;
 assert.match(evaluateRestoreSideEffectSafety(s).join(";"),/extension missing/);
});
test("RLS, grants and privileged callable functions are strict checks",()=>{
 const s=clear();s.publicTablesWithoutRls=1;s.anonymousReadablePublicTables=1;
 s.authenticatedReadableSensitiveTables=1;s.anonymousExecutableDefinerFunctions=1;
 const e=evaluateRestoreSideEffectSafety(s).join(";");
 for(const k of ["without RLS","anonymous public-table","direct sensitive","SECURITY DEFINER"])
  assert.ok(e.includes(k),e);
});
test("unknown/missing and malformed metrics are rejected",()=>{
 assert.match(evaluateRestoreSideEffectSafety(null).join(";"),/missing restored/);
 assert.match(evaluateRestoreSideEffectSafety({}).join(";"),/invalid restore/);
 assert.match(evaluateRestoreSideEffectSafety({...clear(),activeCronJobs:"0"}).join(";"),/invalid restore/);
});
