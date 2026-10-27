import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {validatePrivateRestoreUrl,checkRestoredProvenance} from "../scripts/verifyRestoredStagingDatabase";
const b=JSON.parse(fs.readFileSync("docs/staging-restore-provenance-baseline.json","utf8"));
const copy=()=>structuredClone(b.payload);
test("restore audit can only target the exact local restored database",()=>{
 assert.doesNotThrow(()=>validatePrivateRestoreUrl("postgresql://u:local@127.0.0.1:5432/tgreposter_staging_restore_verification"));
 for(const s of ["https://127.0.0.1/tgreposter_staging_restore_verification",
 "postgresql://u:password@db.msmfilgdwuoymjhgtrmy.supabase.co:5432/tgreposter_staging_restore_verification",
 "postgresql://u:password@127.0.0.1/postgres","garbage"]){
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
