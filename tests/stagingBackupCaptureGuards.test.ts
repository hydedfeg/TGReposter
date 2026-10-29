import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
 STAGING_BACKUP_APPROVAL,STAGING_BACKUP_HOST,
 requireStagingBackupApproval,validateStagingBackupSource,
 validateStagingBackupDestination,validateStagingAgeRecipient,
 validateExportedSnapshotId
} from "../scripts/stagingBackupCaptureGuards";
const source="postgresql://postgres:private-test@db.msmfilgdwuoymjhgtrmy.supabase.co:5432/postgres";
test("only exact STAGING direct Postgres hostname and port are accepted",()=>{
 const s=validateStagingBackupSource(source);
 assert.equal(s.host,STAGING_BACKUP_HOST);
 assert.equal(s.database,"postgres");
 assert.equal(s.port,"5432");
 for(const uri of [
   source.replace("msmfilgdwuoymjhgtrmy","biowrbnafkagaafonzws"),
   source.replace("db.msmfilgdwuoymjhgtrmy.supabase.co","localhost"),
   source.replace(":5432/postgres",":6543/postgres"),
   source.replace("/postgres","/other"),
   source.replace("postgres:private-test","postgres.other:private-test"),
   source+"?host=localhost",source+"#fragment",
   "postgresql://postgres@db.msmfilgdwuoymjhgtrmy.supabase.co:5432/postgres",
   "not-a-postgres-uri"
 ])assert.throws(()=>validateStagingBackupSource(uri),/Refusing|Invalid/);
 assert.throws(()=>validateStagingBackupSource(undefined),/required/);
});
test("backup capture requires explicit approval and age encryption recipient",()=>{
 assert.doesNotThrow(()=>requireStagingBackupApproval(STAGING_BACKUP_APPROVAL));
 for(const s of [undefined,"true","yes","I_APPROVE_PRODUCTION_BACKUP"])
   assert.throws(()=>requireStagingBackupApproval(s),/approval/);
 const recipient="age1"+"q".repeat(57);
 assert.equal(validateStagingAgeRecipient(recipient),recipient);
 for(const v of [undefined,"", "ssh-rsa", "recipient@example.com","age1bad"])
   assert.throws(()=>validateStagingAgeRecipient(v),/age recipient/);
});
test("backup output directory is private, not symlinked, not inside repository",()=>{
 const outer=fs.mkdtempSync(path.join(os.tmpdir(),"private-backup-"));
 const privateDir=path.join(outer,"private");
 try{
   fs.mkdirSync(privateDir,{mode:0o700});
   assert.equal(validateStagingBackupDestination(privateDir,process.cwd()),fs.realpathSync(privateDir));
   assert.throws(()=>validateStagingBackupDestination("relative",process.cwd()),/absolute/);
   const publicDir=path.join(outer,"public");
   fs.mkdirSync(publicDir,{mode:0o755});
   assert.throws(()=>validateStagingBackupDestination(publicDir,process.cwd()),/owner-only/);
   const link=path.join(outer,"link");
   fs.symlinkSync(privateDir,link);
   assert.throws(()=>validateStagingBackupDestination(link,process.cwd()),/owner-only/);
   assert.throws(()=>validateStagingBackupDestination(process.cwd(),process.cwd()),/owner-only/);
 }finally{fs.rmSync(outer,{recursive:true,force:true});}
});
test("exported snapshot ID syntax is validated before pg_dump",()=>{
 assert.equal(validateExportedSnapshotId("00000004-00000241-1"),"00000004-00000241-1");
 for(const v of [null,4,"", "00000004; rm -rf /","00000004-0-1","abc-123","00000004-00000241-1 --dbname=prod"])
   assert.throws(()=>validateExportedSnapshotId(v),/identifier/);
});
test("private capture has a single exported snapshot and never writes a raw dump",()=>{
 const src=fs.readFileSync("scripts/captureStagingBackup.ts","utf8");
 assert.match(src,/pg_export_snapshot\(\)/);
 assert.match(src,/--snapshot=/);
 assert.match(src,/BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/);
 assert.match(src,/commandExit\(dump\)/);
 assert.match(src,/spawn\("age"/);
 assert.match(src,/dump\.stdout\.pipe\(encrypt\.stdin\)/);
 assert.match(src,/encryptedArchiveSha256/);
 assert.doesNotMatch(src,/\.dump"\)/);
});
