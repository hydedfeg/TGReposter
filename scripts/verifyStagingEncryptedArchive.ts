/**
 * Private, offline staging backup archive verifier. Never contacts a DB,
 * stores plaintext, or exposes the decrypted PostgreSQL archive TOC.
 */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createHash,timingSafeEqual} from "node:crypto";
import {spawn,type ChildProcess} from "node:child_process";
import {verifyBackupPaths,verifyBackupManifest} from "./stagingEncryptedArchiveGuards";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
async function fileSha256(file:string):Promise<string>{
 const h=createHash("sha256");
 for await(const bytes of fs.createReadStream(file))h.update(bytes);
 return h.digest("hex");
}
function exitedSuccessfully(c:ChildProcess):Promise<void>{
 return new Promise((resolve,reject)=>{
   c.once("error",()=>reject(Error("Archive inspection process failed.")));
   c.once("close",(code,signal)=>{
     if(code!==0||signal)reject(Error("Archive decryption or PostgreSQL TOC validation failed."));
     else resolve();
   });
 });
}
export async function inspectArchive(archive:string,identity:string):Promise<void>{
 const cleanEnv={PATH:process.env.PATH||"/usr/bin:/bin"};
 const decrypt=spawn("age",["--decrypt","--identity",identity,archive],{
   env:cleanEnv,stdio:["ignore","pipe","ignore"],timeout:1200000
 });
 const inspect=spawn("pg_restore",["--list"],{
   env:cleanEnv,stdio:["pipe","ignore","ignore"],timeout:1200000
 });
 if(!decrypt.stdout||!inspect.stdin)throw Error("Archive validation pipe unavailable.");
 inspect.stdin.on("error",()=>{});
 decrypt.stdout.on("error",()=>{});
 // pg_restore may stop reading after parsing the TOC. Drain any remaining
 // decrypted bytes without storing them, so age checks the entire ciphertext.
 inspect.stdin.on("close",()=>{
   decrypt.stdout?.unpipe(inspect.stdin!);
   decrypt.stdout?.resume();
 });
 decrypt.stdout.pipe(inspect.stdin);
 const outcomes=await Promise.allSettled([
   exitedSuccessfully(decrypt),exitedSuccessfully(inspect)
 ]);
 if(outcomes.some(x=>x.status==="rejected"))
   throw Error("Archive decryption or PostgreSQL TOC validation failed.");
}
async function main():Promise<void>{
 if(process.argv.length!==3||process.argv[2]!=="--verify")
   throw Error("Explicit --verify argument required.");
 const {reference,encrypted,identity}=verifyBackupPaths(
   process.env.STAGING_ARCHIVE_REFERENCE_FILE,
   process.env.STAGING_ENCRYPTED_ARCHIVE_FILE,
   process.env.STAGING_ARCHIVE_AGE_IDENTITY_FILE,ROOT);
 let manifest:unknown;
 try{manifest=JSON.parse(fs.readFileSync(reference,"utf8"));}
 catch{throw Error("Invalid private backup reference JSON.");}
 const expected=verifyBackupManifest(manifest,path.basename(encrypted));
 const actual=await fileSha256(encrypted);
 if(!timingSafeEqual(Buffer.from(actual,"hex"),Buffer.from(expected,"hex")))
   throw Error("Encrypted archive checksum does not match the trusted reference.");
 await inspectArchive(encrypted,identity);
 console.info("PASS: encrypted archive checksum, decryption and PostgreSQL archive TOC.");
 console.info("No database connection or restore was performed.");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(()=>{console.error("Private encrypted archive verification failed.");process.exitCode=1;});
