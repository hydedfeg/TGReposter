import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {ARCHIVE_METHOD,verifyBackupManifest,verifyBackupPaths} from "../scripts/stagingEncryptedArchiveGuards";
const archiveName="staging-2026-10-29T16-20-00-000Z.dump.age";
function sample(){
 const x=JSON.parse(fs.readFileSync("docs/staging-restore-provenance-baseline.json","utf8"));
 x.capture={method:ARCHIVE_METHOD,archiveFile:archiveName,
   capturedAtUtc:"2026-10-29T16:20:00.000Z",
   encryptedArchiveSha256:"a".repeat(64)};
 return x;
}
test("archive reference validates staging and its 12 tenant tables",()=>{
 assert.equal(verifyBackupManifest(sample(),archiveName),"a".repeat(64));
 const altered=sample();altered.capture.method="unverified";
 assert.throws(()=>verifyBackupManifest(altered,archiveName),/metadata/);
 const wrong=sample();wrong.payload.tenantFootprints.source_channels.rowMd5="broken";
 assert.throws(()=>verifyBackupManifest(wrong,archiveName),/fingerprint/);
 const missing=sample();missing.payload.migrationLedger.pop();
 assert.throws(()=>verifyBackupManifest(missing,archiveName),/incomplete/);
});
test("archive/ref/key files reject shared permissions, wrong names and symlinks",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"archive-guard-"));
 const archive=path.join(dir,archiveName),reference=path.join(dir,archiveName.replace(".dump.age",".reference.json"));
 const identity=path.join(dir,"local-key");
 try{
  for(const file of [archive,reference,identity])fs.writeFileSync(file,"synthetic",{mode:0o600});
  assert.equal(verifyBackupPaths(reference,archive,identity,process.cwd()).encrypted,fs.realpathSync(archive));
  fs.chmodSync(identity,0o644);
  assert.throws(()=>verifyBackupPaths(reference,archive,identity,process.cwd()),/owner-only/);
  fs.chmodSync(identity,0o600);
  const link=path.join(dir,"link.age");fs.symlinkSync(archive,link);
  assert.throws(()=>verifyBackupPaths(reference,link,identity,process.cwd()),/owner-only/);
 }finally{fs.rmSync(dir,{force:true,recursive:true});}
});
