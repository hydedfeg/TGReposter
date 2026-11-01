import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { createSalesPlanAdminRouter } from "../server/routes/salesPlanAdmin";

async function serverFor(
  identity:"none"|"admin"|"super-admin",
  cb:(base:string,calls:{list:number;save:number})=>Promise<void>,
  enabled=true
) {
  const calls={list:0,save:0,create:0};
  const app=express();
  app.use(express.json());
  app.use("/api/admin/sales-plans",createSalesPlanAdminRouter({
    authMiddleware:(req:any,_res,next)=>{if(identity!=="none")req.user={
      username:"Alice",role:identity,authProvider:"legacy"
    };next();},
    requireSuperAdmin:(req:any,res,next)=>{
      if(req.user?.role==="super-admin")return next();
      return res.status(403).json({code:"FORBIDDEN"});
    },
    hasDatabase:()=>enabled,
    list:async()=>{calls.list++;return{plans:[],features:[],editorEnabled:false,publicationEnabled:false,newTierCreationEnabled:false};},
    save:async()=>{calls.save++;return{id:"creator",revision:2} as any;},
    create:async()=>{calls.create++;return{id:"custom_regional",revision:1,isPublished:false} as any;}
  }));
  const server=createServer(app);
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const addr=server.address();
  if(!addr||typeof addr==="string")throw Error("Missing port");
  try{await cb(`http://127.0.0.1:${addr.port}/api/admin/sales-plans`,calls);}
  finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
}
const opts={method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({revision:1})};
test("anonymous sessions cannot list or edit global plans",async()=>{
  await serverFor("none",async(base,calls)=>{
    assert.equal((await fetch(base)).status,401);
    assert.equal((await fetch(base+"/creator",opts)).status,401);
    assert.equal((await fetch(base,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:"custom_regional"})})).status,401);
    assert.deepEqual(calls,{list:0,save:0,create:0});
  });
});
test("content administrators cannot access global plan catalog even with a valid login",async()=>{
  await serverFor("admin",async(base,calls)=>{
    assert.equal((await fetch(base)).status,403);
    assert.equal((await fetch(base+"/creator",opts)).status,403);
    assert.equal((await fetch(base,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:"custom_regional"})})).status,403);
    assert.deepEqual(calls,{list:0,save:0,create:0});
  });
});
test("super-admin can list and access protected draft edit API",async()=>{
  await serverFor("super-admin",async(base,calls)=>{
    const list=await fetch(base);
    assert.equal(list.status,200);
    assert.match(list.headers.get("cache-control")??"",/no-store/);
    assert.equal(list.headers.get("vary"),"Authorization");
    assert.equal((await list.json()).publicationEnabled,false);
    const write=await fetch(base+"/creator",opts);
    assert.equal(write.status,200);
    assert.equal((await write.json()).plan.revision,2);
    const created=await fetch(base,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:"custom_regional"})});
    assert.equal(created.status,201);
    assert.equal((await created.json()).plan.isPublished,false);
    assert.deepEqual(calls,{list:1,save:1,create:1});
  });
});
test("missing schema remains a hard 503 and never calls billing services",async()=>{
  await serverFor("super-admin",async(base,calls)=>{
    assert.equal((await fetch(base)).status,503);
    assert.equal((await fetch(base+"/creator",opts)).status,503);
    assert.equal((await fetch(base,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:"custom_regional"})})).status,503);
    assert.deepEqual(calls,{list:0,save:0,create:0});
  },false);
});
test("malformed plan path is refused before a write",async()=>{
  await serverFor("super-admin",async(base,calls)=>{
    assert.equal((await fetch(base+"/INVALIDPLAN",opts)).status,400);
    assert.deepEqual(calls,{list:0,save:0,create:0});
  });
});
