import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
 validatePrivateRestoreUrl,checkRestoredProvenance,
 PRIVATE_RESTORE_ATTESTATION,requirePrivateRestoreAttestation
} from "../scripts/verifyRestoredStagingDatabase";
const b=JSON.parse(fs.readFileSync("docs/staging-restore-provenance-baseline.json","utf8"));
const copy=()=>structuredClone(b.payload);
test("restore audit can only target the exact local restored database",()=>{
 assert.doesNotThrow(()=>validatePrivateRestoreUrl("postgresql://u:local@127.0.0.1:5432/tgreposter_staging_restore_verification"));
 for(const s of ["https://127.0.0.1/tgreposter_staging_restore_verification",
 "postgresql://u:password@db.msmfilgdwuoymjhgtrmy.supabase.co:5432/tgreposter_staging_restore_verification",
 "postgresql://u:password@127.0.0.1/postgres",
 "postgresql://u:password@127.0.0.1/tgreposter_staging_restore_verification?host=other-db.example",
 "postgresql://u:password@127.0.0.1/tgreposter_staging_restore_verification?hostaddr=192.0.2.1",
 "postgresql://u:password@127.0.0.1/tgreposter_staging_restore_verification?service=production",
 "postgresql://u:password@127.0.0.1/tgreposter_staging_restore_verification?sslmode=require",
 "garbage"]){
  assert.throws(()=>validatePrivateRestoreUrl(s),/refuses|Invalid/);
 }
});
test("baseline captures 46 real, hashed staging migrations and has no diffs with itself",()=>{
 assert.equal(b.payload.postgresMajor,17);assert.equal(b.payload.migrationLedger.length,46);
 assert.deepEqual(checkRestoredProvenance(b,copy()),[]);
});
test("missing, modified and extra migrations fail closed",()=>{
 const payload=copy();payload.migrationLedger[0].firstStatementMd5="0".repeat(32);
 assert.match(checkRestoredProvenance(b,payload).join(";"),/provenance/);
 payload.migrationLedger.pop();
 assert.match(checkRestoredProvenance(b,payload).join(";"),/count/);
});
test("schema, owner security and commercial gate drift are detected",()=>{
 const p=copy();p.schemaFingerprints.relation.md5="f".repeat(32);
 p.commercial.publishedPlans=1;p.commercial.backoffColumns=2;p.commercial.entitlementEnforced=true;
 const result=checkRestoredProvenance(b,p).join(";");
 for(const bit of ["relation fingerprint","publishedPlans","pending AI","quota enforcement"])
   assert.ok(result.includes(bit),result);
});

test("snapshot includes only anonymized owner distribution fingerprints and Auth counts",()=>{
 assert.equal(b.payload.authFootprint.users,3);
 assert.equal(b.payload.authFootprint.confirmedUsers,3);
 assert.equal(b.payload.authFootprint.profiles,3);
 assert.equal(b.payload.authFootprint.unmatchedProfiles,0);
 assert.equal(Object.keys(b.payload.tenantFootprints).length,12);
 for(const value of Object.values(b.payload.tenantFootprints) as Array<{rows:number;ownerMd5:string}>){
   assert.ok(Number.isInteger(value.rows)&&value.rows>=0);
   assert.match(value.ownerMd5,/^[0-9a-f]{32}$/);
 }
});
test("restore verifier detects auth/profile loss, owner redistribution and omitted tenant tables",()=>{
 const p=copy();
 p.authFootprint.profiles--;
 p.tenantFootprints.source_channels.ownerMd5="f".repeat(32);
 p.tenantFootprints.promotion_campaigns.rows++;
 const issues=checkRestoredProvenance(b,p).join("; ");
 for(const part of ["Auth/profile profiles count","tenant footprint differs: source_channels",
   "tenant footprint differs: promotion_campaigns"])assert.ok(issues.includes(part),issues);
 delete p.tenantFootprints.telegram_bot_accounts;
 assert.match(checkRestoredProvenance(b,p).join(";"),/tenant table footprint keys differ/);
});
test("missing auth section or replacement tenant footprint map fails closed",()=>{
 const p=copy();
 delete p.authFootprint;
 p.tenantFootprints={};
 const errors=checkRestoredProvenance(b,p).join("; ");
 assert.match(errors,/Auth\/profile footprint fields differ/);
 assert.match(errors,/tenant table footprint keys differ/);
});

test("restored database requires a clone-only operator attestation before schema checks",()=>{
 assert.equal(PRIVATE_RESTORE_ATTESTATION,"TGREPOSTER_PRIVATE_RESTORE_OPERATOR_ATTESTED_v1");
 assert.doesNotThrow(()=>requirePrivateRestoreAttestation(PRIVATE_RESTORE_ATTESTATION));
 for(const value of [null,undefined,"",false,
   "TGREPOSTER_PRIVATE_RESTORE_OPERATOR_ATTESTED",
   "TGREPOSTER_PRIVATE_RESTORE_OPERATOR_ATTESTED_v2",
   "tgreposter_private_restore_operator_attested_v1",
   ["TGREPOSTER_PRIVATE_RESTORE_OPERATOR_ATTESTED_v1"]]){
   assert.throws(()=>requirePrivateRestoreAttestation(value),/attestation missing or invalid/);
 }
});
test("private verifier reads pg_database comment before scanning restored catalog",()=>{
 const body=fs.readFileSync("scripts/verifyRestoredStagingDatabase.ts","utf8");
 const marker=body.indexOf("requirePrivateRestoreAttestation(attestation.rows[0]?.attestation)");
 const sideEffects=body.indexOf("evaluateRestoreSideEffectSafety(safety.rows[0]?.safety_state)");
 const provenance=body.indexOf("checkRestoredProvenance(baseline,result.rows[0].audit_payload)");
 assert.ok(body.includes("shobj_description(oid,'pg_database')"));
 assert.ok(marker>=0&&sideEffects>marker&&provenance>sideEffects,
   "Refuse inspection until clone attestation and side-effect checks pass.");
});
