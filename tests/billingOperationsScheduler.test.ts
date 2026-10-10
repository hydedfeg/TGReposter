import test from "node:test";
import assert from "node:assert/strict";
import {
 startBillingOperationsScheduler,
 parseBillingWorkerIntervalMs
} from "../server/billing/billingOperationsScheduler";

const enabled={
 DATABASE_URL:"postgresql://redacted.example.test/dev",
 TGREPOSTER_BILLING_WORKER_ENABLED:"true",
 TGREPOSTER_SUBSCRIPTION_CHECKOUT_ENABLED:"true"
};

test("billing scheduler never starts unless launch switches are enabled",()=>{
 let called=0;
 const stop=startBillingOperationsScheduler({
  env:{DATABASE_URL:"placeholder"},
  setIntervalFn:()=>{called++;return {}},
  logger:{info(){},warn(){},error(){}}
 });
 stop();
 assert.equal(called,0);
});

test("billing scheduler checks DATABASE_URL and strict intervals",()=>{
 assert.equal(parseBillingWorkerIntervalMs(),60_000);
 assert.equal(parseBillingWorkerIntervalMs("30000"),30000);
 for(const bad of ["0","20000","500.5","foo","90000000"]) {
  assert.throws(()=>parseBillingWorkerIntervalMs(bad),/integer between/);
 }
 let warning="";
 const stop=startBillingOperationsScheduler({
  env:{...enabled,DATABASE_URL:""},
  logger:{info(){},warn(message){warning=message},error(){}}
 });
 stop();
 assert.match(warning,/DATABASE_URL missing/);
});

test("a scheduler uses one timer, immediately runs one cycle and stops cleanly",async()=>{
 let runCount=0;
 let scheduled: (()=>void) | undefined;
 let clears=0;
 const stop=startBillingOperationsScheduler({
  env:enabled,
  runLocked:async()=>{
   runCount++;
   return {acquired:true,report:{
    enabled:true,
    stages:{
      subscriptions:{attempted:0,completed:0,failed:0},
      topups:{attempted:0,completed:0,failed:0},
      renewals:{attempted:0,completed:0,failed:0},
      allowances:{attempted:0,completed:0,failed:0}
    },
    failureCodes:[]
   }};
  },
  setIntervalFn:(fn,ms)=>{
   assert.equal(ms,60_000);
   scheduled=fn;return {unref(){}};
  },
  clearIntervalFn:()=>{clears++},
  logger:{info(){},warn(){},error(){}}
 });
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(runCount,1);
 scheduled?.();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(runCount,2);
 stop();
 stop();
 scheduled?.();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(runCount,2);
 assert.equal(clears,1);
});

test("scheduler never starts a second overlapping cycle",async()=>{
 let called=0;
 let release!:()=>void;
 const blocker=new Promise<void>(resolve=>{release=resolve});
 let scheduled: (()=>void) | undefined;
 const stop=startBillingOperationsScheduler({
  env:enabled,
  runLocked:async()=>{
   called++;
   await blocker;
   return {acquired:false};
  },
  setIntervalFn:(fn)=>{scheduled=fn;return {unref(){}}},
  clearIntervalFn:()=>{},
  logger:{info(){},warn(){},error(){}}
 });
 scheduled?.();
 assert.equal(called,1);
 release();
 await new Promise(resolve=>setImmediate(resolve));
 stop();
});

test("scheduler catches worker failures and continues on subsequent ticks",async()=>{
 let attempts=0;
 let failures=0;
 let scheduled:(()=>void)|undefined;
 const stop=startBillingOperationsScheduler({
  env:enabled,
  runLocked:async()=>{
   attempts++;
   if(attempts===1)throw Error("temporary DB issue");
   return {acquired:false};
  },
  setIntervalFn:(fn)=>{scheduled=fn;return {}},
  clearIntervalFn:()=>{},
  logger:{info(){},warn(){},error(){failures++}}
 });
 await new Promise(resolve=>setImmediate(resolve));
 scheduled?.();
 await new Promise(resolve=>setImmediate(resolve));
 stop();
 assert.equal(attempts,2);
 assert.equal(failures,1);
});
