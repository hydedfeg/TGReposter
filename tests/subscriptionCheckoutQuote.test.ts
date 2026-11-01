import test from "node:test";
import assert from "node:assert/strict";
import {
  euroCentsToUsdtAmount, parseKrakenEurPerUsdt,
  fetchKrakenEurPerUsdt, KRAKEN_USDTEUR_TICKER,
  parseFixedDecimal,
} from "../server/billing/checkoutQuoteService";
import { confirmedTransferQuery } from "../server/billing/subscriptionCheckoutService";

function ticker(ask = "0.925000", bid = "0.924900"): object {
  return {error:[],result:{USDTEUR:{a:[ask,"12","12"],b:[bid,"10","10"]}}};
}

test("quote uses Kraken's USDT/EUR ask, not a false USD stablecoin peg",()=>{
  assert.equal(parseKrakenEurPerUsdt(ticker()),"0.925000000000");
  // €15 at 0.925 EUR per USDT with a 1.5% volatility buffer, round UP.
  assert.equal(euroCentsToUsdtAmount(1500,"0.925"),"16.459460");
  assert.equal(euroCentsToUsdtAmount(1500,"1"),"15.225000");
  assert.equal(parseFixedDecimal("0.925000"),925000000000n);
});

test("market parsing refuses malformed, abnormal or deeply illiquid ticks",()=>{
  assert.throws(()=>parseKrakenEurPerUsdt({error:["Exchange unavailable"],result:{}}),/unavailable/);
  assert.throws(()=>parseKrakenEurPerUsdt({error:[],result:{}}),/Ambiguous/);
  assert.throws(()=>parseKrakenEurPerUsdt(ticker("0.900","0.950")) ,/outside safety/);
  assert.throws(()=>parseKrakenEurPerUsdt(ticker("1","0.80")),/spread is too wide/);
  assert.throws(()=>parseKrakenEurPerUsdt(ticker("2.500","2.400")),/outside safety/);
  assert.throws(()=>parseKrakenEurPerUsdt(ticker("0","0")),/positive/);
  assert.throws(()=>euroCentsToUsdtAmount(-1,"0.925"),/price/);
});

test("FX request uses fixed public market endpoint and no customer-supplied price",async()=>{
  let called=false;
  const rate=await fetchKrakenEurPerUsdt(async (url,opts)=>{
    called=true;
    assert.equal(url,KRAKEN_USDTEUR_TICKER);
    assert.equal(opts?.method,"GET");
    assert.equal(new Headers(opts?.headers).get("authorization"),null);
    return new Response(JSON.stringify(ticker()),{status:200});
  });
  assert.equal(called,true);
  assert.equal(rate,"0.925000000000");
});

test("subscription verification requires a matched confirmed transfer",()=>{
  const sql=confirmedTransferQuery();
  assert.match(sql,/t\.status='confirmed'/);
  assert.match(sql,/t\.amount=i\.expected_amount/);
  assert.match(sql,/i\.status='paid'/);
  assert.match(sql,/t\.network=i\.network/);
});

test("public checkout is inactive unless explicitly enabled",async()=>{
  const previous=process.env.TGREPOSTER_SUBSCRIPTION_CHECKOUT_ENABLED;
  delete process.env.TGREPOSTER_SUBSCRIPTION_CHECKOUT_ENABLED;
  try {
    const {createCheckoutQuote}=await import("../server/billing/checkoutQuoteService");
    const {prepareSubscriptionOrder,fulfillVerifiedSubscription}=await import("../server/billing/subscriptionCheckoutService");
    await assert.rejects(createCheckoutQuote("legacy:alice",{
      kind:"subscription",planId:"professional",interval:"monthly"
    }),/checkout is not yet available/);
    await assert.rejects(prepareSubscriptionOrder("legacy:alice","no-id","no-id"),/checkout is disabled/);
    await assert.rejects(fulfillVerifiedSubscription("legacy:alice","no-id"),/checkout is disabled/);
  }finally{
    if(previous===undefined)delete process.env.TGREPOSTER_SUBSCRIPTION_CHECKOUT_ENABLED;
    else process.env.TGREPOSTER_SUBSCRIPTION_CHECKOUT_ENABLED=previous;
  }
});
