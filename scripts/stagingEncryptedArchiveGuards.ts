import fs from "node:fs";
import path from "node:path";
import {STAGING_ROW_HASH_ALGORITHM} from "./stagingBackupCaptureGuards";

/** Offline-only archive verification. No network or database operations. */
export const ARCHIVE_METHOD="pg_export_snapshot+pg_dump-same-snapshot+age-v1";
function ownerFile(value:string|undefined,repo:string,maxSize:number):string{
 if(!value||!path.isAbsolute(value))throw Error("A private absolute file path is required.");
 let stat:fs.Stats,real:string;
 try{stat=fs.lstatSync(value);real=fs.realpathSync(value);}
 catch{throw Error("Private file is unavailable.");}
 const base=path.resolve(repo);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size===0||stat.size>maxSize||
    real===base||real.startsWith(base+path.sep)||
    (process.platform!=="win32"&&(stat.mode&0o077)!==0)||
    (typeof process.getuid==="function"&&stat.uid!==process.getuid()))
   throw Error("File must be owner-only, regular, and outside the repository.");
 return real;
}
export function verifyBackupPaths(ref:string|undefined,archive:string|undefined,
 key:string|undefined,repo:string){
 const reference=ownerFile(ref,repo,1024*1024);
 const encrypted=ownerFile(archive,repo,50*1024*1024*1024);
 const identity=ownerFile(key,repo,32768);
 const a=path.basename(encrypted),r=path.basename(reference);
 if(!/^staging-[0-9TZ-]+\.dump\.age$/.test(a)||
    r!==a.replace(/\.dump\.age$/,".reference.json")||
    path.dirname(reference)!==path.dirname(encrypted))
   throw Error("Private backup archive and reference do not match.");
 const dir=fs.statSync(path.dirname(encrypted));
 if(!dir.isDirectory()||(process.platform!=="win32"&&(dir.mode&0o077)!==0))
   throw Error("Backup storage directory must be private.");
 return {reference,encrypted,identity};
}
export function verifyBackupManifest(value:unknown,archiveName:string):string{
 if(!value||typeof value!=="object"||Array.isArray(value))
   throw Error("Invalid encrypted backup manifest.");
 const v=value as Record<string,unknown>;
 if(v.sourceProjectRef!=="msmfilgdwuoymjhgtrmy"||
    v.rowFingerprintAlgorithm!==STAGING_ROW_HASH_ALGORITHM)
   throw Error("Archive manifest is not from the approved staging snapshot.");
 const cap=v.capture as Record<string,unknown>|undefined;
 if(!cap||cap.method!==ARCHIVE_METHOD||cap.archiveFile!==archiveName||
    typeof cap.capturedAtUtc!=="string"||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cap.capturedAtUtc)||
    v.recordedDate!==cap.capturedAtUtc.slice(0,10)||
    typeof cap.encryptedArchiveSha256!=="string"||
    !/^[a-f0-9]{64}$/.test(cap.encryptedArchiveSha256))
   throw Error("Encrypted archive checksum or capture metadata invalid.");
 const p=v.payload as Record<string,unknown>|undefined;
 const fp=p?.tenantFootprints as Record<string,Record<string,unknown>>|undefined;
 if(p?.postgresMajor!==17||!Array.isArray(p.migrationLedger)||
    p.migrationLedger.length!==46||!fp||Object.keys(fp).length!==12||
    !p.schemaFingerprints||!p.authFootprint||!p.commercial)
   throw Error("Archive provenance fingerprint is incomplete.");
 for(const f of Object.values(fp)){
   if(!f||!Number.isSafeInteger(f.rows)||typeof f.rows!=="number"||f.rows<0||
      typeof f.ownerMd5!=="string"||!/^[a-f0-9]{32}$/.test(f.ownerMd5)||
      typeof f.rowMd5!=="string"||!/^[a-f0-9]{32}$/.test(f.rowMd5))
     throw Error("Tenant fingerprint missing or invalid.");
 }
 return cap.encryptedArchiveSha256;
}
