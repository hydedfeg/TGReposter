import test from "node:test";
import assert from "node:assert/strict";
import {
  parseGenerationCost,fetchGenerationCost
} from "../server/billing/openRouterReconciliation";
import { fulfillVerifiedTopup, prepareTopupOrder } from "../server/billing/aiTopupService";

test("OpenRouter reconciliation requires authoritative cost tied to requested generation",()=>{
 assert.deepEqual(parseGenerationCost({data:{
  id:"gen-test-abc123",total_cost:0.0075,tokens_prompt:100,tokens_completion:50,
  upstream_inference_cost:100
 }},"gen-test-abc123"),{
  generationId:"gen-test-abc123",
  costUsd:"0.0075000000",
  promptTokens:100,completionTokens:50
 });
 assert.throws(()=>parseGenerationCost({data:{id:"gen-wrong",total_cost:0}},"gen-test-abc123"),/mismatch/);
 assert.throws(()=>parseGenerationCost({data:{id:"gen-test-abc123"}},"gen-test-abc123"),/not yet available/);
 assert.throws(()=>parseGenerationCost({data:{id:"gen-test-abc123",total_cost:-2}},"gen-test-abc123"),/Invalid/);
});

test("generation metadata uses the server API key and never accepts a different generation",async()=>{
 let called=false;
 const result=await fetchGenerationCost("gen-test-abc123","TEST_SERVER_KEY",
  async (url,init)=>{
   called=true;
   const parsed=new URL(String(url));
   assert.equal(parsed.origin,"https://openrouter.ai");
   assert.equal(parsed.pathname,"/api/v1/generation");
   assert.equal(parsed.searchParams.get("id"),"gen-test-abc123");
   assert.equal(new Headers(init?.headers).get("authorization"),"Bearer TEST_SERVER_KEY");
   return new Response(JSON.stringify({data:{
    id:"gen-test-abc123",total_cost:"0.0250000000",tokens_prompt:350,tokens_completion:90
   }}),{status:200});
  });
 assert.equal(called,true);
 assert.equal(result.costUsd,"0.0250000000");
 await assert.rejects(fetchGenerationCost("other-host/path","TEST"),/Invalid/);
});

test("unlaunched top-up services refuse grants before touching a database",async()=>{
 const old=process.env.TGREPOSTER_COMMERCIAL_TOPUPS_ENABLED;
 delete process.env.TGREPOSTER_COMMERCIAL_TOPUPS_ENABLED;
 try{
  await assert.rejects(prepareTopupOrder({
   ownerPrincipal:"legacy:alice",invoiceId:"unknown",packId:"ai_mini",
   quotedUsdtAmount:"7.00",quoteReference:"server-quote-0001"
  }),/top-ups are disabled/);
  await assert.rejects(fulfillVerifiedTopup("legacy:alice","unknown"),/top-ups are disabled/);
 }finally{
  if(old===undefined) delete process.env.TGREPOSTER_COMMERCIAL_TOPUPS_ENABLED;
  else process.env.TGREPOSTER_COMMERCIAL_TOPUPS_ENABLED=old;
 }
});
