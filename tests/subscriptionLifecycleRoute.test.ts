import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {createServer} from "node:http";
import {createBillingOverviewRouter} from "../server/routes/billingOverview";
import {SubscriptionLifecycleError} from "../server/billing/subscriptionLifecycleService";

async function serve(
  auth:express.RequestHandler,
  enabled:boolean,
  cancel:(owner:string,value:boolean)=>Promise<any>,
  testFn:(origin:string)=>Promise<void>
) {
  const app=express();
  app.use(express.json());
  app.use("/api/billing",createBillingOverviewRouter({
    authMiddleware:auth,
    canManage:()=>enabled,
    hasDatabase:()=>true,
    setCancellation:cancel as any
  }));
  const server=createServer(app);
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  try{
    const addr=server.address();
    if(!addr || typeof addr==="string")throw Error("No port");
    await testFn(`http://127.0.0.1:${addr.port}`);
  } finally {
    await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  }
}

const target="/api/billing/subscription/cancellation";
const body=(data:object)=>({
  method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify(data)
});

test("cancellation is unavailable before launch even for authenticated users",async()=>{
  let called=false;
  await serve(
    (req:any,_res,next)=>{req.user={username:"alice",authProvider:"legacy"};next()},
    false,
    async()=>{called=true;return null},
    async url=>{
      const res=await fetch(url+target,body({cancelAtPeriodEnd:true}));
      assert.equal(res.status,503);
      assert.equal((await res.json()).code,"BILLING_MANAGEMENT_DISABLED");
    }
  );
  assert.equal(called,false);
});

test("cancellation only affects the session account and refuses owner spoofing",async()=>{
  let captured="";
  await serve(
    (req:any,_res,next)=>{req.user={username:"ALICE",authProvider:"legacy"};next()},
    true,
    async(owner,value)=>{
      captured=owner+":"+value;
      return {changed:true,cancelAtPeriodEnd:value,effectiveAt:"2026-11-01T00:00:00.000Z"};
    },
    async url=>{
      const bad=await fetch(url+target,body({
        ownerPrincipal:"legacy:bob",cancelAtPeriodEnd:true
      }));
      assert.equal(bad.status,400);
      const good=await fetch(url+target+"?owner=legacy:bob",body({cancelAtPeriodEnd:true}));
      assert.equal(good.status,200);
      assert.match(good.headers.get("cache-control")??"",/no-store/);
      assert.equal((await good.json()).cancellation.changed,true);
    }
  );
  assert.equal(captured,"legacy:alice:true");
});

test("a weak local auth guard cannot bypass cancellation identity enforcement",async()=>{
  let called=false;
  await serve(
    (_req,_res,next)=>next(),
    true,
    async()=>{called=true;return null},
    async url=>{
      const res=await fetch(url+target,body({cancelAtPeriodEnd:true}));
      assert.equal(res.status,401);
    }
  );
  assert.equal(called,false);
});

test("outstanding paid renewal returns conflict, not a silent cancellation",async()=>{
  await serve(
    (req:any,_res,next)=>{req.user={username:"alice",authProvider:"legacy"};next()},
    true,
    async()=>{throw new SubscriptionLifecycleError("PAYMENT_REVIEW_REQUIRED","Resolve prepaid renewal.")},
    async url=>{
      const res=await fetch(url+target,body({cancelAtPeriodEnd:true}));
      assert.equal(res.status,409);
      assert.equal((await res.json()).code,"PAYMENT_REVIEW_REQUIRED");
    }
  );
});
