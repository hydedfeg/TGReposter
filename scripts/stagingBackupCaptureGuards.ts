/**
 * Private, opt-in backup capture guardrails. These functions do not connect
 * to a database, read customer records or create files.
 */
import fs from "node:fs";
import path from "node:path";
export const STAGING_BACKUP_HOST="db.msmfilgdwuoymjhgtrmy.supabase.co";
export const STAGING_BACKUP_DB="postgres";
export const STAGING_BACKUP_APPROVAL="I_APPROVE_PRIVATE_STAGING_SNAPSHOT_CAPTURE";
export const STAGING_ROW_HASH_ALGORITHM="pg17-jsonb-row-md5-sorted-aggregate-v1";
export function validateStagingBackupSource(raw:string|undefined):{
 host:string;port:string;database:string;user:string;password:string;url:string
}{
 if(!raw)throw Error("Private staging backup source URL is required.");
 let u:URL;
 try{u=new URL(raw);}catch{throw Error("Invalid staging backup source URL.");}
 if(!["postgresql:","postgres:"].includes(u.protocol)||
    u.hostname!==STAGING_BACKUP_HOST||u.port!==""&&u.port!=="5432"||
    u.pathname!=="/"+STAGING_BACKUP_DB||u.username!=="postgres"||!u.password||
    u.search||u.hash){
    throw Error("Refusing backup of any database except the exact staging DIRECT Postgres endpoint.");
 }
 return {host:u.hostname,port:"5432",database:STAGING_BACKUP_DB,
   user:"postgres",password:decodeURIComponent(u.password),url:u.toString()};
}
export function validateStagingBackupDestination(value:string|undefined,repoRoot:string):string{
 if(!value||!path.isAbsolute(value))
   throw Error("Specify an absolute private backup output directory.");
 let info:fs.Stats,dir:string;
 try{info=fs.lstatSync(value);dir=fs.realpathSync(value);}
 catch{throw Error("Private backup output directory is unavailable.");}
 const root=path.resolve(repoRoot);
 if(!info.isDirectory()||info.isSymbolicLink()||dir===root||
    dir.startsWith(root+path.sep)||
    (process.platform!=="win32"&&(info.mode&0o077)!==0)||
    (typeof process.getuid==="function"&&info.uid!==process.getuid()))
   throw Error("Private backup output must be an owner-only existing directory outside the repository.");
 return dir;
}
export function validateStagingAgeRecipient(value:string|undefined):string{
 if(!value||!/^age1[a-z0-9]{40,100}$/.test(value))
   throw Error("Valid age recipient public key required for encrypted backup.");
 return value;
}
export function requireStagingBackupApproval(value:string|undefined){
 if(value!==STAGING_BACKUP_APPROVAL)
   throw Error("Private staging backup capture requires explicit operator approval.");
}
export function validateExportedSnapshotId(value:unknown):string{
 if(typeof value!=="string"||!/^\d{8}-\d{8}-\d+$/.test(value))
   throw Error("PostgreSQL exported snapshot identifier is invalid.");
 return value;
}
