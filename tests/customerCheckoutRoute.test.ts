import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { createCustomerCheckoutRouter } from "../server/routes/customerCheckout";
import { isCustomerCheckoutEnabled } from "../server/billing/customerCheckoutService";
import { assertCheckoutInvoiceMatches, CHECKOUT_INVOICE_TTL_MS } from "../server/billing/subscriptionInvoiceCheckout";

const quoteId="01234567-89ab-4cde-8123-0123456789ab";
const orderId="11234567-89ab-4cde-8123-0123456789ab";

async function withCheckout(
  opts: { authenticated?: boolean; enabled?: boolean; database?: boolean } = {},
  cb: (base:string, spies:{quote:string[];orders:string[];reads:string[]})=>Promise<void>
) {
  const spies={quote:[] as string[],orders:[] as string[],reads:[] as string[]};
  const app=express();
  app.use(express.json());
  app.use("/api/billing/checkout", createCustomerCheckoutRouter({
    authMiddleware:(req:any,_res,next)=>{ if(opts.authenticated!==false)req.user={username:"Alice",authProvider:"legacy"};next(); },
    enabled:()=>opts.enabled===true,
    hasDatabase:()=>opts.database!==false,
    catalog:async()=>({enabled:true,networks:["bsc"],plans:[{
      id:"creator",name:"Creator",monthlyEurCents:1500,annualEurCents:15000
    }]}) as any,
    quote:async (owner,planId,interval)=>{spies.quote.push(owner);return {
      id:quoteId,ownerPrincipal:owner,product:{kind:"subscription",planId,interval},
      eurCents:1500,eurPerUsdt:"0.925000000000",
      usdtAmount:"16.459460",rateSource:"kraken:USDTEUR:ask",expiresAt:"2026-10-13T19:00:00Z"
    };},
    createOrder:async(owner)=>{spies.orders.push(owner);return {orderId} as any;},
    readOrder:async(owner)=>{spies.reads.push(owner);return {orderId,planId:"creator"} as any;}
  }));
  const server=createServer(app);
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  try {
    const address=server.address();
    if(!address || typeof address==="string")throw Error("No port");
    await cb("http://127.0.0.1:"+address.port,spies);
  }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
}

test("customer checkout requires three separately enabled backend switches",()=>{
  assert.equal(isCustomerCheckoutEnabled({}),false);
  assert.equal(isCustomerCheckoutEnabled({
    TGREPOSTER_CUSTOMER_CHECKOUT_ENABLED:"true",
    TGREPOSTER_SUBSCRIPTION_CHECKOUT_ENABLED:"true",
    CRYPTO_PAYMENTS_ENABLED:"true"
  }),true);
  assert.equal(isCustomerCheckoutEnabled({
    TGREPOSTER_CUSTOMER_CHECKOUT_ENABLED:"true",
    TGREPOSTER_SUBSCRIPTION_CHECKOUT_ENABLED:"true"
  }),false);
});

test("disabled checkout is visible as unavailable and cannot create invoices or quotes",async()=>{
  await withCheckout({},async(base,spies)=>{
    const status=await fetch(base+"/api/billing/checkout/status");
    assert.deepEqual(await status.json(),{enabled:false,plans:[],networks:[]});
    for(const path of ["quotes","orders"]){
      const r=await fetch(base+"/api/billing/checkout/"+path,{method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({planId:"creator",interval:"monthly",quoteId,network:"bsc"})});
      assert.equal(r.status,503);
      assert.equal((await r.json()).code,"CHECKOUT_DISABLED");
    }
    assert.deepEqual(spies,{quote:[],orders:[],reads:[]});
  });
});

test("checkout is owner-derived, no-store, and denies owner injection or invalid bodies",async()=>{
  await withCheckout({enabled:true},async(base,spies)=>{
    const opts={method:"POST",headers:{"Content-Type":"application/json"}};
    const bad=await fetch(base+"/api/billing/checkout/quotes",{
      ...opts,body:JSON.stringify({planId:"creator",interval:"monthly",ownerPrincipal:"legacy:bob"})
    });
    assert.equal(bad.status,400);
    const quote=await fetch(base+"/api/billing/checkout/quotes",{
      ...opts,body:JSON.stringify({planId:"creator",interval:"monthly"})
    });
    assert.equal(quote.status,201);
    assert.equal(quote.headers.get("cache-control"),"private, no-store");
    assert.equal(quote.headers.get("vary"),"Authorization");
    const q=await quote.json();
    assert.equal(q.quote.id,quoteId);
    assert.equal(q.quote.ownerPrincipal,undefined);
    assert.equal(q.quote.eurPerUsdt,undefined);
    const issued=await fetch(base+"/api/billing/checkout/orders",{
      ...opts,body:JSON.stringify({quoteId,network:"bsc"})
    });
    assert.equal(issued.status,201);
    const read=await fetch(base+"/api/billing/checkout/orders/"+orderId);
    assert.equal(read.status,200);
    assert.deepEqual(spies,{quote:["legacy:alice"],orders:["legacy:alice"],reads:["legacy:alice"]});
  });
});

test("unauthenticated checkout denies all reads and writes before any service access",async()=>{
  await withCheckout({authenticated:false,enabled:true},async(base,spies)=>{
    for(const [path,method] of [["status","GET"],["quotes","POST"],["orders","POST"],
                                ["orders/"+orderId,"GET"]] as const){
      const response=await fetch(base+"/api/billing/checkout/"+path,{method});
      assert.equal(response.status,401);
      assert.equal((await response.json()).code,"BILLING_AUTH_REQUIRED");
    }
    assert.deepEqual(spies,{quote:[],orders:[],reads:[]});
  });
});

test("checkout quote id cannot be reused across network or amount; customer has a 45-minute payment window",()=>{
  assert.equal(CHECKOUT_INVOICE_TTL_MS,45*60_000);
  const invoice={network:"bsc" as const,requested_amount:"16.459460",
    status:"pending" as const,expires_at:"2026-10-13T19:00:00Z"};
  assert.doesNotThrow(()=>assertCheckoutInvoiceMatches(invoice,"bsc","16.45946",Date.parse("2026-10-13T18:00:00Z")));
  assert.throws(()=>assertCheckoutInvoiceMatches(invoice,"ethereum","16.459460",Date.parse("2026-10-13T18:00:00Z")),{code:"INVOICE_CONFLICT"});
  assert.throws(()=>assertCheckoutInvoiceMatches({...invoice,requested_amount:"16.459461"},"bsc","16.45946",Date.parse("2026-10-13T18:00:00Z")),{code:"INVOICE_CONFLICT"});
  assert.throws(()=>assertCheckoutInvoiceMatches(invoice,"bsc","16.45946",Date.parse("2026-10-13T19:00:00Z")),{code:"INVOICE_NOT_PENDING"});
});
