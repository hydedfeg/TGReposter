/**
 * Verify an authorized PRIVATE PostgreSQL 17 restore, not live staging.
 * Run with RESTORED_STAGING_POSTGRES_URL through a secured localhost tunnel.
 * Requires a backup from the same point in time as the reference baseline.
 */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import pg from "pg";
import {evaluateRestoreSideEffectSafety, type RestoreSideEffectState} from "./stagingRestoreSideEffectSafety";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const TARGET="tgreposter_staging_restore_verification";
const ROW_ALGORITHM="pg17-jsonb-row-md5-sorted-aggregate-v1";
/**
 * Clone-only operator attestation; added AFTER restore and network quarantine.
 * This deliberately does not occur in the source staging database or a dump.
 */
export const PRIVATE_RESTORE_ATTESTATION="TGREPOSTER_PRIVATE_RESTORE_OPERATOR_ATTESTED_v1";
export function requirePrivateRestoreAttestation(value:unknown):void{
 if(value!==PRIVATE_RESTORE_ATTESTATION){
   throw Error("Private restore operator attestation missing or invalid.");
 }
}
type M={version:string;name:string;statementCount:number;firstStatementMd5:string};
export type Payload={postgresMajor:number;schemaFingerprints:Record<string,{count:number;md5:string}>;
  migrationLedger:M[];commercial:Record<string,number|boolean>;
  authFootprint:Record<"users"|"confirmedUsers"|"profiles"|"unmatchedProfiles",number>;
  tenantFootprints:Record<string,{rows:number;ownerMd5:string;rowMd5:string}>};
export type Baseline={sourceProjectRef:string;recordedDate:string;rowFingerprintAlgorithm:string;payload:Payload};
/**
 * The committed example snapshot becomes stale when source staging changes.
 * Only accept a private, backup-time-matched reference outside the repo.
 * Explicit file, restrictive permissions, no symlinks and no credentials.
 */
export function validatePrivateRestoreReferenceFile(input:string|undefined):string{
 if(!input||!path.isAbsolute(input))
   throw Error("Provide an absolute private backup-time reference file path.");
 let file:fs.Stats,real:string;
 try{
   file=fs.lstatSync(input);
   real=fs.realpathSync(input);
 }catch{
   throw Error("Private backup-time reference file cannot be read.");
 }
 if(!file.isFile()||file.isSymbolicLink()||file.size>1024*1024||
    (process.platform!=="win32"&&(file.mode&0o077)!==0)||
    (typeof process.getuid==="function"&&file.uid!==process.getuid())||
    real===ROOT||real.startsWith(ROOT+path.sep))
   throw Error("Private backup-time reference must be a restricted regular file outside the repository.");
 return real;
}
export function validatePrivateRestoreUrl(input:string){
  let url:URL;
  try{url=new URL(input);}catch{throw Error("Invalid private restore connection URL.");}
  if(!["postgres:","postgresql:"].includes(url.protocol)||
    !["localhost","127.0.0.1","[::1]"].includes(url.hostname)||
    decodeURIComponent(url.pathname)!=="/"+TARGET||!url.username||
    // PostgreSQL connection parameters can override localhost authority.
    // Reject host/hostaddr/service and ALL other URL query parameters.
    url.search||url.hash){
    throw Error("Restore verifier refuses non-loopback or unexpected database targets.");
  }
}
export function checkRestoredProvenance(reference:Baseline,actual:Payload):string[]{
 const errors:string[]=[];
 if(reference.sourceProjectRef!=="msmfilgdwuoymjhgtrmy")errors.push("unexpected baseline project");
 if(reference.rowFingerprintAlgorithm!==ROW_ALGORITHM)errors.push("unknown baseline row fingerprint algorithm");
 if(reference.payload.postgresMajor!==17||actual.postgresMajor!==17)errors.push("PostgreSQL major version differs");
 const a=reference.payload.schemaFingerprints,b=actual.schemaFingerprints||{};
 if(Object.keys(a).sort().join("|")!==Object.keys(b).sort().join("|"))errors.push("public schema categories differ");
 for(const kind of Object.keys(a)) if(!b[kind]||b[kind].count!==a[kind].count||
   b[kind].md5!==a[kind].md5)errors.push("public "+kind+" fingerprint differs");
 const before=reference.payload.migrationLedger,after=actual.migrationLedger;
 if(before.length!==46||!Array.isArray(after)||before.length!==after.length)errors.push("migration ledger count differs");
 else for(let i=0;i<before.length;i++){const x=before[i],y=after[i];
   if(x.version!==y.version||x.name!==y.name||x.statementCount!==y.statementCount||
      x.firstStatementMd5!==y.firstStatementMd5){errors.push("migration provenance mismatch at row "+(i+1));break;}}
 const old=reference.payload.commercial,now=actual.commercial||{};
 if(Object.keys(old).sort().join("|")!==Object.keys(now).sort().join("|"))errors.push("commercial fields differ");
 for(const k of Object.keys(old))if(now[k]!==old[k])errors.push("commercial "+k+" differs");
 if(now.backoffColumns!==0)errors.push("pending AI reconciliation migration already applied");
 if(now.entitlementEnforced!==false)errors.push("unexpected quota enforcement");
 const expectedAuth=reference.payload.authFootprint||{} as Payload["authFootprint"];
 const restoredAuth=actual.authFootprint||{} as Payload["authFootprint"];
 const authKeys=Object.keys(expectedAuth).sort();
 if(authKeys.length!==4||authKeys.join("|")!==Object.keys(restoredAuth).sort().join("|"))
   errors.push("Auth/profile footprint fields differ");
 for(const k of authKeys) if(restoredAuth[k as keyof Payload["authFootprint"]]!==expectedAuth[k as keyof Payload["authFootprint"]])
   errors.push("Auth/profile "+k+" count differs");
 if(restoredAuth.unmatchedProfiles!==0)errors.push("orphaned restored profile detected");
 if(restoredAuth.confirmedUsers>restoredAuth.users)errors.push("invalid confirmed user count");
 const ownerBefore=reference.payload.tenantFootprints||{};
 const ownerAfter=actual.tenantFootprints||{};
 if(Object.keys(ownerBefore).length!==12||
    Object.keys(ownerBefore).sort().join("|")!==Object.keys(ownerAfter).sort().join("|"))
   errors.push("tenant table footprint keys differ");
 for(const [table,footprint] of Object.entries(ownerBefore)){
   const next=ownerAfter[table];
   if(!next||footprint.rows!==next.rows||footprint.ownerMd5!==next.ownerMd5)
     errors.push("tenant footprint differs: "+table);
   // Fail closed even if row counts and owner distributions are unchanged.
   if(typeof footprint.rowMd5!=="string"||!/^[0-9a-f]{32}$/.test(footprint.rowMd5))
     errors.push("invalid baseline row content digest: "+table);
   if(!next||typeof next.rowMd5!=="string"||!/^[0-9a-f]{32}$/.test(next.rowMd5)||
      footprint.rowMd5!==next.rowMd5)
     errors.push("tenant row content differs: "+table);
 }
 return [...new Set(errors)];
}
async function main(){
 const value=process.env.RESTORED_STAGING_POSTGRES_URL;
 if(!value)throw Error("Provide RESTORED_STAGING_POSTGRES_URL privately.");
 validatePrivateRestoreUrl(value);
 const manifestPath=validatePrivateRestoreReferenceFile(
   process.env.RESTORED_STAGING_REFERENCE_FILE);
 let baseline:Baseline;
 try{baseline=JSON.parse(fs.readFileSync(manifestPath,"utf8")) as Baseline;}
 catch{throw Error("Private backup-time reference is not valid JSON.");}
 if(!baseline||typeof baseline!=="object"||baseline.sourceProjectRef!=="msmfilgdwuoymjhgtrmy"||
    baseline.rowFingerprintAlgorithm!==ROW_ALGORITHM||!baseline.payload||
    !baseline.payload.schemaFingerprints||!baseline.payload.migrationLedger||
    !baseline.payload.tenantFootprints||!baseline.payload.authFootprint)
   throw Error("Private backup-time reference has invalid provenance fields.");
 const query=fs.readFileSync(path.join(ROOT,"scripts/sql/stagingRestoreFingerprint.sql"),"utf8");
 const sideEffectSql=fs.readFileSync(path.join(ROOT,"scripts/sql/stagingRestoreSideEffectGate.sql"),"utf8");
 const pool=new pg.Pool({connectionString:value,max:1,connectionTimeoutMillis:7000,
   query_timeout:25000,application_name:"tgreposter-private-restore-audit"});
 try{
  const c=await pool.connect();
  try{
   await c.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
   await c.query("SET LOCAL statement_timeout='20s'");
   // JSONB renders time-sensitive types using session settings.
   // Pin these on the private restore to match the source staging snapshot.
   await c.query("SET LOCAL TIME ZONE 'UTC'");
   await c.query("SET LOCAL DateStyle TO 'ISO, MDY'");
   await c.query("SET LOCAL IntervalStyle TO 'postgres'");
   const id=await c.query<{db:string}>("SELECT current_database() AS db");
   if(id.rows[0]?.db!==TARGET)throw Error("Restored database identity differs");
   // A loopback URL can still be an SSH tunnel to a live database.
   // Require an explicit marker that was written ONLY into the quarantined
   // restored clone after the operator disabled external side effects.
   const attestation=await c.query<{attestation:string|null}>(
     "SELECT shobj_description(oid,'pg_database') AS attestation " +
     "FROM pg_database WHERE datname=current_database()");
   requirePrivateRestoreAttestation(attestation.rows[0]?.attestation);
   const safety=await c.query<{safety_state:RestoreSideEffectState}>(sideEffectSql);
   const problems=evaluateRestoreSideEffectSafety(safety.rows[0]?.safety_state);
   if(problems.length)throw Error("Restore side-effect gate FAILED: "+problems.join("; "));
   const result=await c.query<{audit_payload:Payload}>(query);
   if(result.rows.length!==1)throw Error("Audit row count differs");
   const errors=checkRestoredProvenance(baseline,result.rows[0].audit_payload);
   if(errors.length)throw Error("Restore verification FAILED: "+errors.join("; "));
   console.info("PASS: schema, 46 migration digests, commercial, Auth/profile and 12 tenant ownership/full-row content fingerprints match baseline.");
   console.info("This alone does NOT prove backup completeness, row integrity or recovery readiness.");
  }finally{await c.query("ROLLBACK").catch(()=>{});c.release();}
 }finally{await pool.end();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(err=>{
  const message=err instanceof Error?err.message:"unknown error";
  if(message.startsWith("Restore side-effect gate FAILED:")||
     message.startsWith("Restore verification FAILED:")||message.startsWith("Provide ")||
     message.startsWith("Restore verifier refuses")||message.startsWith("Invalid ")||
     message.startsWith("Restored database identity")||
     message.startsWith("Private restore operator attestation")||
     message.startsWith("Provide an absolute private backup-time")||
     message.startsWith("Private backup-time reference")||
     message.startsWith("Audit row count"))
    console.error(message);
  else console.error("Restore verifier failed; inspect the trusted private environment.");
  process.exitCode=1;
 });
