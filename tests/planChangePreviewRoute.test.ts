import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {createServer} from "node:http";
import {createBillingOverviewRouter} from "../server/routes/billingOverview";
import {PlanChangePreviewError} from "../server/billing/planChangePreview";

async function withServer(
  authenticated:boolean,
  enabled:boolean,
  preview:(owner:string,plan:string)=>Promise<any>,
  run:(base:string)=>Promise<void>
) {
  const app=express();
  app.use("/api/billing",createBillingOverviewRouter({
    authMiddleware:(req:any,_res,next)=>{
      if(authenticated)req.user={username:"Alice",authProvider:"legacy"};
      next();
    },
    loadOverview:async()=>({}) as any,
    hasDatabase:()=>true,
    canPreview:()=>enabled,
    previewChange:preview as any
  }));
  const server=createServer(app);
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  try{
    const addr=server.address();
    if(!addr || typeof addr==="string") throw Error("Missing test server port");
    await run(`http://127.0.0.1:${addr.port}`);
  } finally {
    await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  }
}

const path="/api/billing/subscription/change-preview";

test("plan preview route is disabled even for logged-in customers",async()=>{
  let called=false;
  await withServer(true,false,async()=>{
    called=true;return {};
  },async base=>{
    const res=await fetch(base+path+"?targetPlanId=business");
    assert.equal(res.status,503);
    assert.equal((await res.json()).code,"PLAN_CHANGE_PREVIEW_DISABLED");
  });
  assert.equal(called,false);
});

test("plan preview route only derives owner from authenticated session",async()=>{
  const calls:string[]=[];
  await withServer(true,true,async(owner,plan)=>{
    calls.push(owner+":"+plan);
    return {kind:"non_binding_estimate",checkoutEnabled:false,estimatedAdditionalCents:650};
  },async base=>{
    const invalid=await fetch(base+path+"?targetPlanId=professional&ownerPrincipal=legacy:bob");
    assert.equal(invalid.status,400);
    const valid=await fetch(base+path+"?targetPlanId=business");
    assert.equal(valid.status,200);
    assert.equal(valid.headers.get("cache-control"),"private, no-store");
    const json=await valid.json();
    assert.equal(json.preview.kind,"non_binding_estimate");
    assert.equal(json.preview.checkoutEnabled,false);
  });
  assert.deepEqual(calls,["legacy:alice:business"]);
});

test("preview is unavailable without a proven session",async()=>{
  let called=false;
  await withServer(false,true,async()=>{called=true;return {}},async base=>{
    const res=await fetch(base+path+"?targetPlanId=business");
    assert.equal(res.status,401);
  });
  assert.equal(called,false);
});

test("conflicting payment or prepaid renewal yields a safe 409",async()=>{
  await withServer(true,true,async()=>{
    throw new PlanChangePreviewError("PAYMENT_REVIEW_REQUIRED","A verified renewal already exists.");
  },async base=>{
    const res=await fetch(base+path+"?targetPlanId=business");
    assert.equal(res.status,409);
    assert.equal((await res.json()).code,"PAYMENT_REVIEW_REQUIRED");
  });
});
