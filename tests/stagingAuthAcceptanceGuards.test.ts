import test from "node:test";
import assert from "node:assert/strict";
import {
  requireStagingBase,requireStagingApiUrl,refuseHttpRedirect,
  validateTwoTestAccounts,assertIsolatedAccountEvidence,
  STAGING_PRIVATE_GET_PATHS,STAGING_FORGED_TOKEN_GET_PATHS
} from "../scripts/stagingAuthAcceptanceGuards";

const free=(sources=0)=>({
  availability:"prelaunch",plan:{id:"free"},subscription:null,
  usage:{sources,destinations:0,activeCampaigns:0},
  ai:{includedAvailable:"0",purchasedAvailable:"0"},orders:[]
});

test("staging acceptance does not allow redirects, alternate hosts or userinfo",()=>{
 const base=requireStagingBase("https://tgreposter-staging-production.up.railway.app");
 assert.equal(base.origin,"https://tgreposter-staging-production.up.railway.app");
 for(const raw of [
   "https://api.tgreposter.com","http://tgreposter-staging-production.up.railway.app",
   "https://tgreposter-staging-production.up.railway.app:444",
   "https://user:pass@tgreposter-staging-production.up.railway.app",
   "https://tgreposter-staging-production.up.railway.app/redirect"
 ])assert.throws(()=>requireStagingBase(raw),/Refusing/);
 assert.doesNotThrow(()=>requireStagingApiUrl(new URL("/api/billing/overview",base),base));
 assert.throws(()=>requireStagingApiUrl(new URL("https://api.tgreposter.com/api/billing/overview"),base),/Refusing/);
 for(const status of [301,302,303,307,308])assert.throws(()=>refuseHttpRedirect(status),/redirect refused/);
 assert.doesNotThrow(()=>refuseHttpRedirect(401));
});
test("requires two distinct staging users and never accepts missing passwords",()=>{
 const accounts=[{email:"a@staging.invalid",password:"alice-private-placeholder"},
  {email:"b@staging.invalid",password:"bob-private-placeholder"}];
 assert.doesNotThrow(()=>validateTwoTestAccounts(accounts));
 assert.throws(()=>validateTwoTestAccounts([accounts[0],accounts[0]]),/distinct/);
 assert.throws(()=>validateTwoTestAccounts([{email:"a@staging.invalid",password:""},accounts[1]]),/required/);
});
test("identical empty Free accounts are INCONCLUSIVE, not tenant-isolation proof",()=>{
 assert.throws(()=>assertIsolatedAccountEvidence(
   free(),free(),free(),free(),[],[],[],[]
 ),/INCONCLUSIVE/);
});
test("distinct owner fixtures with ineffective cross-owner overrides pass",()=>{
 assert.doesNotThrow(()=>assertIsolatedAccountEvidence(
   free(1),free(1),free(0),free(0),
   [{username:"staging_a"}],[],[{username:"staging_a"}],[]
 ));
});
test("foreign owner query overrides must not change channel or billing snapshots",()=>{
 assert.throws(()=>assertIsolatedAccountEvidence(
   free(1),free(0),free(0),free(0),[],[],[],[]
 ),/override changed Alice/);
 assert.throws(()=>assertIsolatedAccountEvidence(
   free(1),free(1),free(0),free(0),
   [{username:"owner_a"}],[],[],[]
 ),/override changed Alice/);
});

test("promotion owner overrides cannot change read-only bot, target or campaign snapshots",()=>{
 const extra=[{
  name:"promotion campaigns",
  aliceOriginal:[{id:"only-alice"}],
  aliceOverride:[{id:"only-alice"}],
  bobOriginal:[],
  bobOverride:[]
 }];
 assert.doesNotThrow(()=>assertIsolatedAccountEvidence(
   free(),free(),free(),free(),[],[],[],[],extra
 ));
 assert.throws(()=>assertIsolatedAccountEvidence(
   free(),free(),free(),free(),[],[],[],[],
   [{...extra[0],aliceOverride:[{id:"foreign-owner-data"}]}]
 ),/override changed Alice's private promotion campaigns/);
 assert.throws(()=>assertIsolatedAccountEvidence(
   free(),free(),free(),free(),[],[],[],[],
   [{...extra[0],bobOverride:[{id:"foreign-owner-data"}]}]
 ),/override changed Bob's private promotion campaigns/);
});

test("empty promotion resources alone do not establish positive owner isolation",()=>{
 assert.throws(()=>assertIsolatedAccountEvidence(
   free(),free(),free(),free(),[],[],[],[],
   [{name:"promotion targets",aliceOriginal:[],aliceOverride:[],bobOriginal:[],bobOverride:[]}]
 ),/INCONCLUSIVE/);
});

test("staging preflight covers protected payment, billing, promotion, AI and database reads",()=>{
 const paths=new Set(STAGING_PRIVATE_GET_PATHS);
 assert.equal(paths.size,23,"Private GET list must not include duplicates.");
 for(const p of [
   "/api/billing/overview",
   "/api/billing/checkout/orders/00000000-0000-0000-0000-000000000000",
   "/api/billing/subscription/change-preview?targetPlanId=free",
   "/api/crypto-payments/notifications/status",
   "/api/crypto-payments/invoices/00000000-0000-0000-0000-000000000000",
   "/api/promotion/campaigns/00000000-0000-0000-0000-000000000000",
   "/api/supabase/status",
   "/api/ai/openrouter/models",
 ])assert.ok(paths.has(p),"Missing private route: "+p);
 for(const path of STAGING_PRIVATE_GET_PATHS) {
   const url=new URL(path,requireStagingBase("https://tgreposter-staging-production.up.railway.app"));
   assert.doesNotThrow(()=>requireStagingApiUrl(url,requireStagingBase("https://tgreposter-staging-production.up.railway.app")));
   assert.ok(!url.pathname.startsWith("/api/auth/"),"Preflight must not call authentication mutations.");
   assert.equal(url.hash,"");
 }
});
test("forged token paths are genuine private GET routes and unique",()=>{
 const all=new Set(STAGING_PRIVATE_GET_PATHS);
 const forged=new Set(STAGING_FORGED_TOKEN_GET_PATHS);
 assert.equal(forged.size,10,"Forged bearer list must have 10 unique reads.");
 for(const path of forged)assert.ok(all.has(path),"Unknown forged-token route: "+path);
});
