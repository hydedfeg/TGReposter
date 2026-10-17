import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { createBillingOverviewRouter } from "../server/routes/billingOverview";

async function withServer(
  auth: express.RequestHandler,
  loadOverview: (owner: string) => Promise<any>,
  check: (base: string) => Promise<void>,
  hasDatabase = true
) {
  const app = express();
  app.use("/api/billing",createBillingOverviewRouter({
    authMiddleware:auth,
    loadOverview:loadOverview as any,
    hasDatabase:()=>hasDatabase
  }));
  const server=createServer(app);
  await new Promise<void>((resolve)=>server.listen(0,"127.0.0.1",resolve));
  try {
    const address=server.address();
    if(!address || typeof address==="string")throw Error("No test listener");
    await check(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

test("billing API never accepts user-supplied owner and sets no-store headers",async()=>{
  let captured="";
  await withServer(
    (req:any,_res,next)=>{req.user={username:"Alice",authProvider:"legacy"};next()},
    async owner=>{captured=owner;return {availability:"prelaunch",orders:[]}},
    async base=>{
      const response=await fetch(base+"/api/billing/overview?owner_principal=legacy:bob",{
        headers:{Authorization:"Bearer demo-ignored"}
      });
      assert.equal(response.status,200);
      assert.match(response.headers.get("cache-control")??"",/no-store/);
      assert.equal(response.headers.get("vary"),"Authorization");
      assert.deepEqual(await response.json(),{overview:{availability:"prelaunch",orders:[]}});
    }
  );
  assert.equal(captured,"legacy:alice");
});

test("billing API denies missing authenticated identity even if an old local auth guard passes",async()=>{
  let calls=0;
  await withServer((_req,_res,next)=>next(),async()=>{calls++;return null},async base=>{
    const response=await fetch(base+"/api/billing/overview");
    assert.equal(response.status,401);
    assert.equal((await response.json()).code,"BILLING_AUTH_REQUIRED");
  });
  assert.equal(calls,0);
});

test("billing schema absence is a clear 503 and cannot be mistaken for zero balances",async()=>{
  await withServer(
    (req:any,_res,next)=>{req.user={id:"00000000-0000-4000-8000-000000000009",
      authProvider:"supabase"};next()},
    async()=>{throw Object.assign(Error("missing relation"),{code:"42P01"})},
    async base=>{
      const response=await fetch(base+"/api/billing/overview");
      assert.equal(response.status,503);
      assert.equal((await response.json()).code,"BILLING_NOT_READY");
    }
  );
});

test("billing endpoint does not consult the database when not configured",async()=>{
  let calls=0;
  await withServer(
    (req:any,_res,next)=>{req.user={username:"Alice",authProvider:"legacy"};next()},
    async()=>{calls++;return null},
    async base=>{
      const response=await fetch(base+"/api/billing/overview");
      assert.equal(response.status,503);
      assert.equal((await response.json()).code,"BILLING_NOT_READY");
    },false
  );
  assert.equal(calls,0);
});
