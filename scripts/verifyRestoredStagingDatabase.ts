/**
 * Verify an authorized PRIVATE PostgreSQL 17 restore, not live staging.
 * Run with RESTORED_STAGING_POSTGRES_URL through a secured localhost tunnel.
 * Requires a backup from the same point in time as the reference baseline.
 */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import pg from "pg";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const TARGET="tgreposter_staging_restore_verification";
type M={version:string;name:string;statementCount:number;firstStatementMd5:string};
export type Payload={postgresMajor:number;schemaFingerprints:Record<string,{count:number;md5:string}>;
  migrationLedger:M[];commercial:Record<string,number|boolean>};
export type Baseline={sourceProjectRef:string;recordedDate:string;payload:Payload};
export function validatePrivateRestoreUrl(input:string){
  let url:URL;
  try{url=new URL(input);}catch{throw Error("Invalid private restore connection URL.");}
  if(!["postgres:","postgresql:"].includes(url.protocol)||
    !["localhost","127.0.0.1","[::1]"].includes(url.hostname)||
    decodeURIComponent(url.pathname)!=="/"+TARGET||!url.username||url.hash){
    throw Error("Restore verifier refuses non-loopback or unexpected database targets.");
  }
}
export function checkRestoredProvenance(reference:Baseline,actual:Payload):string[]{
 const errors:string[]=[];
 if(reference.sourceProjectRef!=="msmfilgdwuoymjhgtrmy")errors.push("unexpected baseline project");
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
 return [...new Set(errors)];
}
async function main(){
 const value=process.env.RESTORED_STAGING_POSTGRES_URL;
 if(!value)throw Error("Provide RESTORED_STAGING_POSTGRES_URL privately.");
 validatePrivateRestoreUrl(value);
 const baseline=JSON.parse(fs.readFileSync(path.join(ROOT,
   "docs/staging-restore-provenance-baseline.json"),"utf8")) as Baseline;
 const query=fs.readFileSync(path.join(ROOT,"scripts/sql/stagingRestoreFingerprint.sql"),"utf8");
 const pool=new pg.Pool({connectionString:value,max:1,connectionTimeoutMillis:7000,
   query_timeout:25000,application_name:"tgreposter-private-restore-audit"});
 try{
  const c=await pool.connect();
  try{
   await c.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
   await c.query("SET LOCAL statement_timeout='20s'");
   const id=await c.query<{db:string}>("SELECT current_database() AS db");
   if(id.rows[0]?.db!==TARGET)throw Error("Restored database identity differs");
   const result=await c.query<{audit_payload:Payload}>(query);
   if(result.rows.length!==1)throw Error("Audit row count differs");
   const errors=checkRestoredProvenance(baseline,result.rows[0].audit_payload);
   if(errors.length)throw Error("Restore verification FAILED: "+errors.join("; "));
   console.info("PASS: schema, 46 migration digests and commercial aggregates match baseline.");
   console.info("This alone does NOT prove backup completeness, row integrity or recovery readiness.");
  }finally{await c.query("ROLLBACK").catch(()=>{});c.release();}
 }finally{await pool.end();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(err=>{
  const message=err instanceof Error?err.message:"unknown error";
  if(message.startsWith("Restore verification FAILED:")||message.startsWith("Provide ")||
     message.startsWith("Restore verifier refuses")||message.startsWith("Invalid ")||
     message.startsWith("Restored database identity")||message.startsWith("Audit row count"))
    console.error(message);
  else console.error("Restore verifier failed; inspect the trusted private environment.");
  process.exitCode=1;
 });
