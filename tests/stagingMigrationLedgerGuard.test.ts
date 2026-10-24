import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";

/**
 * Historical staging migration inventory — local files and committed snapshot
 * only. Never contacts a live database, repairs a migration ledger, or executes
 * archived SQL. Updating this snapshot requires a separate reviewed audit.
 */
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const migrationDir=path.join(root,"supabase","migrations");
const snapshot=JSON.parse(fs.readFileSync(
  path.join(root,"docs","staging-migration-ledger-snapshot.json"),"utf8"
)) as {
  sourceCommit:string;
  stagingProjectRef:string;
  sourceMigrationCount:number;
  appliedLedgerCount:number;
  sourceFiles:{file:string;blobSha1:string}[];
  drift:{
    file:string;storedVersion:string;name:string;storedMd5:string;
    storedTrimmedMd5:string;statementCount:number;
    disposition:"byte_identical"|"trailing_newline_only"|
      "baseline_plus_recovered_repairs";
  }[];
  repairArchive:{
    version:string;name:string;path:string;storedMd5:string;
    statementCount:number;
  }[];
  originalBaselineArchive:{
    version:string;name:string;path:string;storedMd5:string;
    statementCount:number;
  };
  unappliedSourceFiles:string[];
};

const hex=(algo:"sha1"|"md5",bytes:Buffer|string)=>
  createHash(algo).update(bytes).digest("hex");
const gitBlobSha1=(bytes:Buffer)=>
  createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");

test("historical staging migration snapshot is intentionally pinned to the audited source",()=>{
  assert.match(snapshot.sourceCommit,/^[a-f0-9]{40}$/);
  assert.equal(snapshot.stagingProjectRef,"msmfilgdwuoymjhgtrmy");
  assert.equal(snapshot.sourceMigrationCount,45);
  assert.equal(snapshot.appliedLedgerCount,46);
  assert.equal(snapshot.drift.length,23);
  assert.equal(snapshot.repairArchive.length,2);
  assert.equal(snapshot.originalBaselineArchive.version,"20260910134818");
  assert.deepEqual(snapshot.unappliedSourceFiles,
    ["20261021154000_ai_reconciliation_backoff.sql"]);
});

test("migration file inventory and Git blobs cannot silently change or replay historical versions",()=>{
  const actual=fs.readdirSync(migrationDir)
    .filter(file=>file.endsWith(".sql")).sort();
  const expected=snapshot.sourceFiles.map(x=>x.file).sort();
  assert.deepEqual(actual,expected,
    "Historical migration set changed: review the staging ledger and update the snapshot explicitly");
  const names=new Set<string>();
  for(const record of snapshot.sourceFiles){
    assert.match(record.file,/^\d+_[a-z0-9_]+\.sql$/);
    assert.match(record.blobSha1,/^[a-f0-9]{40}$/);
    const name=record.file.replace(/^\d+_/,"").replace(/\.sql$/,"");
    assert.ok(!names.has(name),`Same migration name has multiple versions: ${name}`);
    names.add(name);
    const bytes=fs.readFileSync(path.join(migrationDir,record.file));
    assert.equal(gitBlobSha1(bytes),record.blobSha1,
      `Audited migration source changed: ${record.file}`);
  }
});

test("all 23 staging version drifts retain the reviewed source-to-ledger relationship",()=>{
  const audited=new Set<string>();
  let exact=0;
  let newline=0;
  let divergent=0;
  for(const row of snapshot.drift){
    assert.ok(!audited.has(row.name),"Duplicated migration name in drift snapshot");
    audited.add(row.name);
    assert.equal(row.statementCount,1,
      "Reinspect historical ledger because the stored statement count changed");
    assert.match(row.storedVersion,/^\d{14}$/);
    assert.match(row.storedMd5,/^[0-9a-f]{32}$/);
    const source=fs.readFileSync(path.join(migrationDir,row.file),"utf8");
    const sourceHash=hex("md5",source);
    if(row.disposition==="byte_identical"){
      assert.equal(sourceHash,row.storedMd5,`Historical SQL differs: ${row.name}`);
      exact++;
    }else if(row.disposition==="trailing_newline_only"){
      assert.notEqual(sourceHash,row.storedMd5);
      assert.equal(hex("md5",source.trimEnd()),row.storedTrimmedMd5,
        "Whitespace-only difference requires a fresh review");
      newline++;
    }else{
      assert.equal(row.disposition,"baseline_plus_recovered_repairs");
      assert.notEqual(sourceHash,row.storedMd5,
        "GitHub's initial baseline is expected to contain two recovered repairs");
      const original=fs.readFileSync(
        path.join(root,snapshot.originalBaselineArchive.path),"utf8"
      );
      const anchor="-- User profiles (linked to Supabase Auth)";
      const atSource=source.indexOf(anchor);
      const atOriginal=original.indexOf(anchor);
      assert.ok(atSource>0 && atOriginal>0);
      assert.equal(source.slice(atSource).trimEnd(),
        original.slice(atOriginal).trimEnd(),
        "The baseline table definitions must equal the original stored staging SQL");
      const repairSql=snapshot.repairArchive.map(x=>
        fs.readFileSync(path.join(root,x.path),"utf8")).join("\n");
      const canonical=(sql:string)=>sql.replace(/--[^\n]*/g,"")
        .split(";").map(x=>x.trim().replace(/\s+/g," ").toLowerCase())
        .filter(Boolean).sort();
      assert.deepEqual(
        canonical(source.slice(0,atSource)),
        canonical(original.slice(0,atOriginal)+"\n"+repairSql),
        "The baseline additions must match exactly the two recovered repair SQL scripts"
      );
      divergent++;
    }
  }
  assert.deepEqual({exact,newline,divergent},{exact:21,newline:1,divergent:1});
});

test("two recovered repair SQL archives remain unmodified and outside runnable migration directory",()=>{
  for(const row of [...snapshot.repairArchive,snapshot.originalBaselineArchive]){
    assert.match(row.path,/^docs\/sql\/staging-ledger-archive\/\d+_[a-z0-9_]+\.sql$/);
    assert.equal(row.statementCount,1);
    const bytes=fs.readFileSync(path.join(root,row.path));
    assert.equal(hex("md5",bytes),row.storedMd5,
      "Recovered SQL archive must match the original Supabase staging ledger");
    assert.ok(!fs.existsSync(path.join(migrationDir,path.basename(row.path))),
      "Do not register historical staging repairs as new executable migrations");
  }
});
