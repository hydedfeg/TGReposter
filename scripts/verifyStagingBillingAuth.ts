/**
 * Staging two-account Auth and billing isolation acceptance.
 *
 * NO purchase, subscription, mutation, Telegram message or test account creation.
 * --preflight runs anonymously with no secrets and never attempts a login.
 *
 * Run credential-free: TGREPOSTER_STAGING_BASE_URL=https://tgreposter-staging-production.up.railway.app
 *   npx tsx scripts/verifyStagingBillingAuth.ts --preflight
 *
 * Real acceptance: In a trusted PRIVATE operator environment, set
 * TGREPOSTER_STAGING_ALICE_EMAIL / _PASSWORD
 * TGREPOSTER_STAGING_BOB_EMAIL / _PASSWORD and run without --preflight.
 * Do not paste passwords/JWTs into chat, CI or terminal history.
 * Do not execute the real-account mode on a public runner.
 */
import assert from "node:assert/strict";
import {
  requireStagingBase, requireStagingApiUrl, refuseHttpRedirect,
  validateTwoTestAccounts, assertIsolatedAccountEvidence,
} from "./stagingAuthAcceptanceGuards";

const args=process.argv.slice(2);
if(args.some(a=>a!=="--preflight") || args.length>1)
  throw new Error("Only --preflight (credential-free) is supported as an argument.");
const preflightOnly=args.includes("--preflight");
const base=requireStagingBase(process.env.TGREPOSTER_STAGING_BASE_URL);

async function getJson(path:string,init:RequestInit={}) {
  const url=new URL(path,base);
  requireStagingApiUrl(url,base);
  // Never auto-follow a redirect with an Authorization header or login password.
  const response=await fetch(url,{
    ...init,
    cache:"no-store",
    credentials:"omit",
    redirect:"manual",
    signal:AbortSignal.timeout(15000)
  });
  refuseHttpRedirect(response.status);
  let body:unknown;
  try{body=await response.json();}catch{body=null;}
  return {response,body:body as Record<string,any>|null};
}
async function preflight() {
  for(const path of ["/api/billing/overview",
     "/api/billing/overview?owner_principal=supabase%3Aforged-override"]){
    const anonymous=await getJson(path);
    assert.equal(anonymous.response.status,401,
      "Anonymous private billing API read must be denied.");
  }
  const forged=await getJson("/api/billing/overview",{
    headers:{Authorization:"Bearer staging-acceptance-intentionally-invalid-jwt"}
  });
  assert.equal(forged.response.status,401,
    "Invalid bearer JWT must be denied.");
  const channels=await getJson("/api/channels");
  assert.equal(channels.response.status,401,"Anonymous source-channel access must fail.");
  console.info("PASS: anonymous, owner-override and forged-JWT staging API preflight (no credentials).");
}
async function login(email:string,password:string) {
  const {response,body}=await getJson("/api/auth/login",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({username:email,password})
  });
  assert.equal(response.status,200,"Staging Supabase account failed to sign in.");
  assert.equal(body?.authProvider,"supabase","Login must use staging Supabase.");
  assert.equal(body?.success,true);
  assert.match(String(body?.accountKey??""),/^supabase:[0-9a-f-]{36}$/i);
  assert.equal(typeof body?.token,"string");
  assert.ok(body!.token.length>32,"Missing signed access token");
  return {token:String(body!.token),accountKey:String(body!.accountKey)};
}
async function billing(token:string,ownerOverride?:string){
  const path="/api/billing/overview"+(ownerOverride?
    "?owner_principal="+encodeURIComponent(ownerOverride):"");
  const {response,body}=await getJson(path,{
    headers:{Authorization:"Bearer "+token}
  });
  assert.equal(response.status,200,"Owner billing overview unavailable.");
  assert.match(response.headers.get("cache-control")??"",/no-store/i);
  assert.match(response.headers.get("vary")??"",/authorization/i);
  const view=body?.overview;
  assert.ok(view && typeof view==="object");
  assert.equal(view.availability,"prelaunch");
  assert.equal(view.plan?.id,"free");
  assert.deepEqual(view.orders,[],"Staging acceptance accounts must have no paid orders.");
  assert.equal(view.subscription,null,"No paid subscription may exist for a test account.");
  assert.equal(Number(view.ai?.includedAvailable),0);
  assert.equal(Number(view.ai?.purchasedAvailable),0);
  assert.equal("ownerPrincipal" in view,false,"Owner identifier leaked in billing view.");
  return view;
}
async function channels(token:string,ownerOverride?:string){
  const path="/api/channels"+(ownerOverride?
    "?owner_principal="+encodeURIComponent(ownerOverride):"");
  const {response,body}=await getJson(path,{
    headers:{Authorization:"Bearer "+token}
  });
  assert.equal(response.status,200,"Owner source channels unavailable.");
  assert.ok(Array.isArray(body),"Source-channel response must be an array.");
  return body as unknown[];
}
async function run(){
  await preflight();
  if(preflightOnly){
    console.info("PREFLIGHT ONLY: Real two-account Auth isolation remains UNVERIFIED.");
    return;
  }
  const accounts=[
    {email:process.env.TGREPOSTER_STAGING_ALICE_EMAIL,password:process.env.TGREPOSTER_STAGING_ALICE_PASSWORD},
    {email:process.env.TGREPOSTER_STAGING_BOB_EMAIL,password:process.env.TGREPOSTER_STAGING_BOB_PASSWORD},
  ];
  validateTwoTestAccounts(accounts);
  const [alice,bob]=await Promise.all(accounts.map(c=>login(c.email!,c.password!)));
  assert.notEqual(alice.accountKey,bob.accountKey,"Both logins mapped to one identity.");
  const [av,avOverride,bv,bvOverride,ac,acOverride,bc,bcOverride]=await Promise.all([
    billing(alice.token),billing(alice.token,bob.accountKey),
    billing(bob.token),billing(bob.token,alice.accountKey),
    channels(alice.token),channels(alice.token,bob.accountKey),
    channels(bob.token),channels(bob.token,alice.accountKey)
  ]);
  assertIsolatedAccountEvidence(av,avOverride,bv,bvOverride,ac,bc,acOverride,bcOverride);
  console.info("PASS: two real staging Supabase identities; distinguishable owner fixtures; " +
    "foreign-owner overrides ineffective; no paid commercial data.");
}
run().catch(error=>{
  // Fail closed without any stack traces, JSON, emails, JWTs or passwords.
  const safe=error instanceof Error?error.message:"Unspecified acceptance error.";
  console.error("FAIL: staging Auth acceptance:",
    /password|token|secret|bearer\s+[a-z0-9._-]{20,}/i.test(safe)?
      "Private acceptance check failed; inspect in the trusted operator environment.":safe);
  process.exitCode=1;
});
