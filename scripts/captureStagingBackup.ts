/**
 * Operator-only coordinated STAGING capture. Never execute on Railway, CI,
 * production or any shared runner. Does not perform a restore.
 *
 * A PostgreSQL exported snapshot is held open while the metadata fingerprint
 * is queried and pg_dump imports that SAME snapshot. The raw dump streams
 * directly into age encryption; only encrypted data is written to disk.
 */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawn,type ChildProcess} from "node:child_process";
import {createHash} from "node:crypto";
import pg from "pg";
import {
 STAGING_BACKUP_APPROVAL,STAGING_ROW_HASH_ALGORITHM,
 validateStagingBackupSource,validateStagingBackupDestination,
 validateStagingAgeRecipient,requireStagingBackupApproval,
 validateExportedSnapshotId
} from "./stagingBackupCaptureGuards";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
function commandExit(child:ChildProcess):Promise<number>{
 return new Promise((resolve,reject)=>{
   child.once("error",()=>reject(Error("Private backup helper could not start.")));
   child.once("close",(code,signal)=>{
     if(code!==0||signal)reject(Error("Private backup helper failed or timed out."));
     else resolve(code);
   });
 });
}
async function sha256File(file:string):Promise<string>{
 const sha=createHash("sha256");
 for await(const chunk of fs.createReadStream(file))sha.update(chunk);
 return sha.digest("hex");
}
async function capture(){
 if(process.argv.length!==3||process.argv[2]!=="--capture")
   throw Error("Explicit --capture flag required for private staging backup.");
 requireStagingBackupApproval(process.env.STAGING_BACKUP_OPERATOR_APPROVED);
 const source=validateStagingBackupSource(process.env.STAGING_BACKUP_SOURCE_POSTGRES_URL);
 const dir=validateStagingBackupDestination(process.env.STAGING_BACKUP_OUTPUT_DIR,ROOT);
 const recipient=validateStagingAgeRecipient(process.env.STAGING_BACKUP_AGE_RECIPIENT);
 const stamp=new Date().toISOString().replace(/[:.]/g,"-");
 const archive=path.join(dir,"staging-"+stamp+".dump.age");
 const manifest=path.join(dir,"staging-"+stamp+".reference.json");
 // File flags 'wx' and owner-only destination ensure no overwrites.
 let createdArchive=false,createdManifest=false,client:pg.Client|undefined;
 try{
   client=new pg.Client({connectionString:source.url,ssl:{rejectUnauthorized:true},
     connectionTimeoutMillis:10000,query_timeout:60000,
     application_name:"tgreposter-private-snapshot-backup"});
   await client.connect();
   await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
   await client.query("SET LOCAL TIME ZONE 'UTC'");
   await client.query("SET LOCAL DateStyle TO 'ISO, MDY'");
   await client.query("SET LOCAL IntervalStyle TO 'postgres'");
   const version=await client.query<{version:number;database:string}>(
     "SELECT current_setting('server_version_num')::integer AS version,current_database() AS database");
   if(version.rows[0]?.version<170000||version.rows[0]?.version>=180000||
      version.rows[0]?.database!=="postgres")
     throw Error("Expected direct staging PostgreSQL 17 database.");
   const snapshotRes=await client.query<{snapshot_id:string}>(
     "SELECT pg_export_snapshot() AS snapshot_id");
   const snapshot=validateExportedSnapshotId(snapshotRes.rows[0]?.snapshot_id);
   const sql=fs.readFileSync(path.join(ROOT,"scripts/sql/stagingRestoreFingerprint.sql"),"utf8");
   const refResult=await client.query<{audit_payload:unknown}>(sql);
   if(refResult.rows.length!==1||!refResult.rows[0]?.audit_payload)
     throw Error("Private backup reference query failed.");
   const payload=refResult.rows[0].audit_payload as Record<string,unknown>;
   if(payload.postgresMajor!==17||!Array.isArray(payload.migrationLedger)||
      payload.migrationLedger.length!==46||
      typeof payload.tenantFootprints!=="object"||!payload.tenantFootprints||
      Object.keys(payload.tenantFootprints).length!==12)
     throw Error("Private staging reference provenance is incomplete.");

   const out=fs.openSync(archive,"wx",0o600);
   createdArchive=true;
   try{
     // Limit inherited environment: never pass the full URL on a command line,
     // and never inherit PGHOST/PGSERVICE/PGOPTIONS overrides.
     const basicEnv={PATH:process.env.PATH||"/usr/bin:/bin"};
     const dump=spawn("pg_dump",["--no-password","--format=custom",
       "--snapshot="+snapshot],{
       env:{...basicEnv,PGHOST:source.host,PGPORT:source.port,
         PGDATABASE:source.database,PGUSER:source.user,
         PGPASSWORD:source.password,PGSSLMODE:"verify-full",
         PGCONNECT_TIMEOUT:"10"},
       stdio:["ignore","pipe","ignore"],timeout:1200000
     });
     const encrypt=spawn("age",["-r",recipient],{
       env:basicEnv,stdio:["pipe",out,"ignore"],timeout:1200000
     });
     if(!dump.stdout||!encrypt.stdin)throw Error("Private backup encryption pipe missing.");
     dump.stdout.pipe(encrypt.stdin);
     // Keep the exported snapshot alive until pg_dump has fully exited.
     const [dumpOk,encryptOk]=await Promise.allSettled([
       commandExit(dump),commandExit(encrypt)
     ]);
     if(dumpOk.status!=="fulfilled"||encryptOk.status!=="fulfilled")
       throw Error("Encrypted snapshot capture failed; discard the incomplete archive.");
   }finally{fs.closeSync(out);}
   if(fs.statSync(archive).size===0)throw Error("Empty encrypted archive.");
   const checksum=await sha256File(archive);
   const reference={
     sourceProjectRef:"msmfilgdwuoymjhgtrmy",
     recordedDate:new Date().toISOString().slice(0,10),
     rowFingerprintAlgorithm:STAGING_ROW_HASH_ALGORITHM,
     payload,
     capture:{
       method:"pg_export_snapshot+pg_dump-same-snapshot+age-v1",
       capturedAtUtc:new Date().toISOString(),
       encryptedArchiveSha256:checksum,
       archiveFile:path.basename(archive)
     }
   };
   fs.writeFileSync(manifest,JSON.stringify(reference,null,2)+"\n",
     {flag:"wx",mode:0o600});
   createdManifest=true;
   console.info("SUCCESS: encrypted staging snapshot and matching private reference generated.");
   console.info("Keep both files private; independently validate recovery on an egress-isolated restore.");
   console.info("This is a PostgreSQL database dump, not a full Supabase platform/Storage/roles backup.");
 }catch{
   if(createdManifest)try{fs.unlinkSync(manifest);}catch{}
   if(createdArchive)try{fs.unlinkSync(archive);}catch{}
   throw Error("Private staging encrypted backup was not completed; no partial artifacts retained.");
 }finally{
   if(client){await client.query("ROLLBACK").catch(()=>{});await client.end().catch(()=>{});}
 }
}
capture().catch(err=>{
 const text=err instanceof Error?err.message:"Private staging backup capture failed.";
 console.error(text);
 process.exitCode=1;
});
