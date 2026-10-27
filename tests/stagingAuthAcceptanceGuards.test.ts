import test from "node:test";
import assert from "node:assert/strict";
import {
  requireStagingBase,requireStagingApiUrl,refuseHttpRedirect,
  validateTwoTestAccounts,assertIsolatedAccountEvidence
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
