import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Offline source-vs-applied SQL parity from the read-only staging baseline.
 * No remote connection or migration execution occurs.
 */
const root=path.resolve(process.cwd());
const baseline=JSON.parse(fs.readFileSync(path.join(root,
 "docs/staging-restore-provenance-baseline.json"),"utf8"));
const entries=baseline.payload.migrationLedger as Array<{
 version:string;name:string;firstStatementMd5:string;statementCount:number;
}>;
const files=fs.readdirSync(path.join(root,"supabase/migrations"))
 .filter(file=>file.endsWith(".sql")).sort();
const index=new Map(files.map(file=>[
 file.split("_").slice(1).join("_").replace(/\.sql$/,""),file
]));
const hash=(file:string)=>crypto.createHash("md5").update(
 fs.readFileSync(path.join(root,"supabase/migrations",file))).digest("hex");
const mismatches=entries.filter(row=>index.has(row.name)&&
 hash(index.get(row.name)!)!==row.firstStatementMd5).map(x=>x.name).sort();
const expectedMismatches=[
 "allow_zero_value_crypto_unassigned_observations",
 "create_crypto_payment_network_state",
 "create_demo_requests",
 "index_crypto_payment_event_transactions",
 "initial_schema",
 "persist_user_ui_locale"
].sort();
const stagingOnly=entries.filter(row=>!index.has(row.name)).map(x=>x.name).sort();
const pending=files.filter(file=>!entries.some(x=>
 x.name===file.split("_").slice(1).join("_").replace(/\.sql$/,"")));
const aliases=entries.filter(row=>index.has(row.name)&&
 !index.get(row.name)!.startsWith(row.version+"_")).length;

test("staging archive has no unreviewed applied/source additions or removals",()=>{
 assert.equal(baseline.sourceProjectRef,"msmfilgdwuoymjhgtrmy");
 assert.equal(entries.length,46);
 assert.equal(files.length,45);
 assert.equal(new Set(entries.map(x=>x.name)).size,entries.length);
 assert.equal(new Set(entries.map(x=>x.version)).size,entries.length);
 assert.deepEqual(stagingOnly,[
   "repair_missing_curator_settings_baseline",
   "repair_missing_pg_cron_baseline"
 ]);
 assert.deepEqual(pending,["20261021154000_ai_reconciliation_backoff.sql"]);
 assert.equal(aliases,23);
});
test("historical source byte parity remains anchored to staging migration hashes",()=>{
 assert.deepEqual(mismatches,expectedMismatches,
   "Source SQL changed or staging baseline became stale. Review before any db push.");
 assert.equal(entries.filter(row=>index.has(row.name)&&
   hash(index.get(row.name)!)===row.firstStatementMd5).length,38);
});
