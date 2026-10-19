import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { createCustomerCheckoutRouter } from "../server/routes/customerCheckout";
import { isCustomerCheckoutEnabled, isTopupCheckoutEnabled } from "../server/billing/customerCheckoutService";
import { assertCheckoutInvoiceMatches, CHECKOUT_INVOICE_TTL_MS } from "../server/billing/subscriptionInvoiceCheckout";
import {CheckoutRateLimitError} from "../server/billing/checkoutRateLimit";

const quoteId="01234567-89ab-4cde-8123-0123456789ab";
const orderId="11234567-89ab-4cde-8123-0123456789ab";

async function withCheckout(
  opts: { authenticated?: boolean; enabled?: boolean; topupsEnabled?:boolean; database?: boolean; blockedAction?:"quote"|"invoice" } = {},
  cb: (base:string, spies:{quote:string[];orders:string[];reads:string[];topupQuotes:string[];topupOrders:string[]})=>Promise<void>
) {
  const spies={quote:[] as string[],orders:[] as string[],reads:[] as string[],topupQuotes:[] as string[],topupOrders:[] as string[]};
  const app=express();
  app.use(express.json());
  app.use("/api/billing/checkout", createCustomerCheckoutRouter({
    authMiddleware:(req:any,_res,next)=>{ if(opts.authenticated!==false)req.user={username:"Alice",authProvider:"legacy"};next(); },
    enabled:()=>opts.enabled===true,
    hasDatabase:()=>opts.database!==false,
    checkBudget:async(_owner,action)=>{if(opts.blockedAction===action)throw new CheckoutRateLimitError(120);},
    topupsEnabled:()=>opts.topupsEnabled===true,
    catalog:async()=>({enabled:opts.enabled===true,topupsEnabled:opts.topupsEnabled===true,
      networks:opts.enabled===true?["bsc"]:[],
      plans:[{id:"creator",name:"Creator",monthlyEurCents:1500,annualEurCents:15000}],
      packs:[{id:"ai_mini",name:"AI Mini",aiUnits:"500",priceEurCents:700}]
    }) as any,
    quote:async (owner,planId,interval)=>{spies.quote.push(owner);return {
      id:quoteId,ownerPrincipal:owner,product:{kind:"subscription",planId,interval},
      eurCents:1500,eurPerUsdt:"0.925000000000",
      usdtAmount:"16.459460",rateSource:"kraken:USDTEUR:ask",expiresAt:"2026-10-13T19:00:00Z"
    };},
    createOrder:async(owner)=>{spies.orders.push(owner);return {orderId} as any;},
    topupQuote:async(owner,packId)=>{spies.topupQuotes.push(owner);return {
      id:quoteId,ownerPrincipal:owner,product:{kind:"topup",packId},
      eurCents:700,eurPerUsdt:"0.925000000000",
      usdtAmount:"7.681082",rateSource:"kraken:USDTEUR:ask",expiresAt:"2026-10-13T19:00:00Z"
    };},
    topupOrder:async(owner)=>{spies.topupOrders.push(owner);return {orderId} as any;},
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
    CRYPTO_PAYMENTS_ENABLED:"true",
    TGREPOSTER_BILLING_WORKER_ENABLED:"true"
  }),true);
  assert.equal(isCustomerCheckoutEnabled({
    TGREPOSTER_CUSTOMER_CHECKOUT_ENABLED:"true",
    TGREPOSTER_SUBSCRIPTION_CHECKOUT_ENABLED:"true"
  }),false);
  assert.equal(isTopupCheckoutEnabled({
    TGREPOSTER_CUSTOMER_CHECKOUT_ENABLED:"true",
    TGREPOSTER_SUBSCRIPTION_CHECKOUT_ENABLED:"true",
    CRYPTO_PAYMENTS_ENABLED:"true",TGREPOSTER_BILLING_WORKER_ENABLED:"true",
    TGREPOSTER_COMMERCIAL_TOPUPS_ENABLED:"true"
  }),false);
  assert.equal(isTopupCheckoutEnabled({
    TGREPOSTER_CUSTOMER_CHECKOUT_ENABLED:"true",
    TGREPOSTER_SUBSCRIPTION_CHECKOUT_ENABLED:"true",
    CRYPTO_PAYMENTS_ENABLED:"true",TGREPOSTER_BILLING_WORKER_ENABLED:"true",
    TGREPOSTER_COMMERCIAL_AI_ENABLED:"true",
    TGREPOSTER_COMMERCIAL_TOPUPS_ENABLED:"true"
  }),true);
});

test("disabled checkout is visible as unavailable and cannot create invoices or quotes",async()=>{
  await withCheckout({},async(base,spies)=>{
    const status=await fetch(base+"/api/billing/checkout/status");
    assert.deepEqual(await status.json(),{
      enabled:false,topupsEnabled:false,networks:[],
      plans:[{id:"creator",name:"Creator",monthlyEurCents:1500,annualEurCents:15000}],
      packs:[{id:"ai_mini",name:"AI Mini",aiUnits:"500",priceEurCents:700}]
    });
    for(const path of ["quotes","orders","topups/quotes","topups/orders"]){
      const r=await fetch(base+"/api/billing/checkout/"+path,{method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({planId:"creator",interval:"monthly",quoteId,network:"bsc"})});
      assert.equal(r.status,503);
      assert.equal((await r.json()).code,path.startsWith("topups/")?"TOPUPS_DISABLED":"CHECKOUT_DISABLED");
    }
    assert.deepEqual(spies,{quote:[],orders:[],reads:[],topupQuotes:[],topupOrders:[]});
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
    assert.deepEqual(spies,{quote:["legacy:alice"],orders:["legacy:alice"],reads:["legacy:alice"],topupQuotes:[],topupOrders:[]});
  });
});

test("unauthenticated checkout denies all reads and writes before any service access",async()=>{
  await withCheckout({authenticated:false,enabled:true},async(base,spies)=>{
    for(const [path,method] of [["status","GET"],["quotes","POST"],["orders","POST"],["topups/quotes","POST"],["topups/orders","POST"],
                                ["orders/"+orderId,"GET"]] as const){
      const response=await fetch(base+"/api/billing/checkout/"+path,{method});
      assert.equal(response.status,401);
      assert.equal((await response.json()).code,"BILLING_AUTH_REQUIRED");
    }
    assert.deepEqual(spies,{quote:[],orders:[],reads:[],topupQuotes:[],topupOrders:[]});
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

test("top-up route uses the authenticated owner and rejects injected account/amount",async()=>{
  await withCheckout({enabled:true,topupsEnabled:true},async(base,spies)=>{
    const opts={method:"POST",headers:{"Content-Type":"application/json"}};
    const bad=await fetch(base+"/api/billing/checkout/topups/quotes",{
      ...opts,body:JSON.stringify({packId:"ai_mini",ownerPrincipal:"legacy:bob"})
    });
    assert.equal(bad.status,400);
    const issuedQuote=await fetch(base+"/api/billing/checkout/topups/quotes",{
      ...opts,body:JSON.stringify({packId:"ai_mini"})
    });
    assert.equal(issuedQuote.status,201);
    assert.equal(issuedQuote.headers.get("cache-control"),"private, no-store");
    assert.equal((await issuedQuote.json()).quote.product.kind,"topup");
    const wrongOrder=await fetch(base+"/api/billing/checkout/topups/orders",{
      ...opts,body:JSON.stringify({quoteId,network:"bsc",amount:"0.000001"})
    });
    assert.equal(wrongOrder.status,400);
    const order=await fetch(base+"/api/billing/checkout/topups/orders",{
      ...opts,body:JSON.stringify({quoteId,network:"bsc"})
    });
    assert.equal(order.status,201);
    assert.equal((await order.json()).order.orderId,orderId);
    assert.deepEqual(spies.topupQuotes,["legacy:alice"]);
    assert.deepEqual(spies.topupOrders,["legacy:alice"]);
  });
});

test("top-up mutations stay closed when only subscription checkout is ready",async()=>{
  await withCheckout({enabled:true,topupsEnabled:false},async(base,spies)=>{
    const res=await fetch(base+"/api/billing/checkout/topups/quotes",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({packId:"ai_mini"})
    });
    assert.equal(res.status,503);
    assert.equal((await res.json()).code,"TOPUPS_DISABLED");
    assert.deepEqual(spies.topupQuotes,[]);
  });
});

test("both subscription and top-up quotes receive 429 with Retry-After before issuing price",async()=>{
  await withCheckout({enabled:true,topupsEnabled:true,blockedAction:"quote"},async(base,spies)=>{
    for(const [route,body] of [
      ["quotes",{planId:"creator",interval:"monthly"}],
      ["topups/quotes",{packId:"ai_mini"}]
    ] as const){
      const result=await fetch(base+"/api/billing/checkout/"+route,{
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)
      });
      assert.equal(result.status,429);
      assert.equal(result.headers.get("retry-after"),"120");
      assert.equal(result.headers.get("cache-control"),"private, no-store");
      assert.equal((await result.json()).code,"CHECKOUT_RATE_LIMITED");
    }
    assert.deepEqual(spies.quote,[]);
    assert.deepEqual(spies.topupQuotes,[]);
  });
});

test("subscription and top-up invoice paths use same budget and never issue when blocked",async()=>{
  await withCheckout({enabled:true,topupsEnabled:true,blockedAction:"invoice"},async(base,spies)=>{
    for(const route of ["orders","topups/orders"]){
      const result=await fetch(base+"/api/billing/checkout/"+route,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({quoteId,network:"bsc"})
      });
      assert.equal(result.status,429);
      assert.equal((await result.json()).code,"CHECKOUT_RATE_LIMITED");
    }
    assert.deepEqual(spies.orders,[]);
    assert.deepEqual(spies.topupOrders,[]);
  });
});

test("disabled checkout does not invoke throttles or issue invoices",async()=>{
  await withCheckout({enabled:false,blockedAction:"quote"},async(base,spies)=>{
    const result=await fetch(base+"/api/billing/checkout/quotes",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({planId:"creator",interval:"monthly"})
    });
    assert.equal(result.status,503);
    assert.equal((await result.json()).code,"CHECKOUT_DISABLED");
    assert.deepEqual(spies.quote,[]);
  });
});
