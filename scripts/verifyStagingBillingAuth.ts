/**
 * Manually run against the existing Railway STAGING backend with TWO genuine,
 * separate Supabase Auth test accounts.
 *
 * This test never creates accounts, writes billing data, posts to Telegram,
 * or creates a crypto payment. Supply credentials through your trusted
 * process environment; never commit them or paste JWTs into a build log.
 *
 * Required environment:
 * TGREPOSTER_STAGING_BASE_URL (exact staging hostname)
 * TGREPOSTER_STAGING_ALICE_EMAIL / _PASSWORD
 * TGREPOSTER_STAGING_BOB_EMAIL / _PASSWORD
 *
 * Run: npx tsx scripts/verifyStagingBillingAuth.ts
 */
import assert from "node:assert/strict";

const vars=process.env;
const rawUrl=vars.TGREPOSTER_STAGING_BASE_URL;
if(!rawUrl)throw new Error("Specify TGREPOSTER_STAGING_BASE_URL explicitly.");
const base=new URL(rawUrl);
if(base.protocol!=="https:" ||
   base.hostname!=="tgreposter-staging-production.up.railway.app" ||
   base.username || base.password || base.search || base.hash ||
   !["","/"].includes(base.pathname)) {
  throw new Error("Refusing to test any host other than the known staging Railway origin.");
}
const credentials=[
  {label:"Alice",email:vars.TGREPOSTER_STAGING_ALICE_EMAIL,password:vars.TGREPOSTER_STAGING_ALICE_PASSWORD},
  {label:"Bob",email:vars.TGREPOSTER_STAGING_BOB_EMAIL,password:vars.TGREPOSTER_STAGING_BOB_PASSWORD}
];
for(const c of credentials) {
  if(!c.email?.includes("@") || !c.password || c.password.length<8) {
    throw new Error("Provide two existing, email-confirmed staging-only test accounts through environment variables.");
  }
}
if(credentials[0].email?.toLowerCase()===credentials[1].email?.toLowerCase()){
  throw new Error("Alice and Bob must use different staging identities.");
}

async function getJson(url:URL,init:RequestInit={}) {
  const response=await fetch(url,{...init,cache:"no-store",signal:AbortSignal.timeout(15000)});
  let body:unknown;
  try{body=await response.json();}catch{body=null;}
  return {response,body:body as Record<string,any>|null};
}
async function login(email:string,password:string){
  const {response,body}=await getJson(new URL("/api/auth/login",base),{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({username:email,password})
  });
  assert.equal(response.status,200,"Existing staging Supabase test account could not sign in");
  assert.equal(body?.authProvider,"supabase","Auth should be backed by real Supabase");
  assert.equal(body?.success,true);
  assert.match(String(body?.accountKey??""),/^supabase:[0-9a-f-]{36}$/i);
  assert.equal(typeof body?.token,"string");
  assert.ok(body!.token.length>32,"Missing signed access token");
  return {token:String(body!.token),accountKey:String(body!.accountKey)};
}
async function overview(token:string,otherOwner:string) {
  const url=new URL("/api/billing/overview",base);
  url.searchParams.set("owner_principal",otherOwner);
  const {response,body}=await getJson(url,{
    headers:{Authorization:`Bearer ${token}`}
  });
  assert.equal(response.status,200,"Billing overview must be accessible to its authenticated owner");
  assert.match(response.headers.get("cache-control")??"",/no-store/i);
  assert.ok(body?.overview && typeof body.overview==="object");
  assert.equal(body.overview.availability,"prelaunch","Staging catalog must remain unpublished");
  assert.equal(body.overview.plan?.id,"free","No staging test account should receive paid access");
  assert.deepEqual(body.overview.orders,[],"No real commercial orders should exist");
  assert.equal(Number(body.overview.ai.includedAvailable),0);
  assert.equal(Number(body.overview.ai.purchasedAvailable),0);
  assert.equal(body.overview.subscription,null);
  // A controlled staging route returns the same owner-owned data regardless
  // of an attempted arbitrary owner override. No principal ID is exposed.
  assert.equal("ownerPrincipal" in body.overview,false);
  return body.overview;
}
async function main() {
  const unauth=await getJson(new URL("/api/billing/overview",base));
  assert.equal(unauth.response.status,401,"Anonymous reads must fail");
  const forged=await getJson(new URL("/api/billing/overview",base),{
    headers:{Authorization:"Bearer phase11-invalid-jwt-fixture"}
  });
  assert.equal(forged.response.status,401,"Forged bearer tokens must fail");
  // Never log passwords, tokens, emails or principal IDs.
  const [alice,bob]=await Promise.all(credentials.map(c=>login(c.email!,c.password!)));
  assert.notEqual(alice.accountKey,bob.accountKey,"Both test sessions resolve to the same account");
  const [viewAlice,viewBob]=await Promise.all([
    overview(alice.token,bob.accountKey),
    overview(bob.token,alice.accountKey)
  ]);
  assert.equal(viewAlice.plan.id,"free");
  assert.equal(viewBob.plan.id,"free");
  console.info("PASS: two real staging Supabase logins, distinct identities, protected owner billing routes, no paid entitlements.");
}
main().catch(error=>{
  // Do not print response objects or stack traces that might hold JWTs.
  console.error("FAIL: staging authenticated billing acceptance:",error instanceof Error?error.message:"Unspecified error");
  process.exitCode=1;
});
