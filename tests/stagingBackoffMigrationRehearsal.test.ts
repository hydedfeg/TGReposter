import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { reconcilePendingOpenRouterUsage } from "../server/billing/openRouterReconciliation";

/**
 * Non-destructive migration rehearsal against an isolated PostgreSQL-compatible
 * engine. This does NOT connect to Supabase, replay its ledger, or run workers.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root,"supabase","migrations");
const pendingFile = "20261021154000_ai_reconciliation_backoff.sql";
const snapshot = JSON.parse(fs.readFileSync(
  path.join(root,"docs","staging-migration-ledger-snapshot.json"),"utf8"
)) as {
  sourceMigrationCount:number;
  appliedLedgerCount:number;
  drift:Array<{file:string;name:string;storedVersion:string}>;
  repairArchive:Array<{version:string;name:string}>;
  unappliedSourceFiles:string[];
  sourceFiles:Array<{file:string}>;
};

test("disposable rehearsal maps all original staging migration identities without replay",()=>{
  const drift=new Map(snapshot.drift.map(x=>[x.name,x.storedVersion]));
  const resolved=snapshot.sourceFiles.filter(x=>!snapshot.unappliedSourceFiles.includes(x.file))
    .map(({file})=>{
      const name=file.replace(/^\d+_/,"").replace(/\.sql$/,"");
      return {name,version:drift.get(name)??file.split("_")[0]};
    });
  resolved.push(...snapshot.repairArchive.map(({name,version})=>({name,version})));
  assert.equal(snapshot.sourceFiles.length,snapshot.sourceMigrationCount);
  assert.equal(snapshot.sourceFiles.length,45);
  assert.equal(snapshot.appliedLedgerCount,46);
  assert.equal(snapshot.drift.length,23);
  assert.deepEqual(snapshot.unappliedSourceFiles,[pendingFile]);
  assert.equal(resolved.length,snapshot.appliedLedgerCount);
  assert.equal(new Set(resolved.map(x=>x.name)).size,resolved.length);
  assert.equal(new Set(resolved.map(x=>x.version)).size,resolved.length);
  assert.ok(!resolved.some(x=>x.name==="ai_reconciliation_backoff"));
  assert.ok(resolved.some(x=>x.version==="20261019133218" && x.name==="checkout_rate_limits"));
  assert.ok(resolved.some(x=>x.version==="20261019174232" && x.name==="atomic_plan_capacity_guards"));
  for(const row of snapshot.drift){
    assert.ok(resolved.some(x=>x.name===row.name && x.version===row.storedVersion));
  }
});

test("staging-schema rehearsal rolls back, applies backoff and preserves owner billing invariants",async()=>{
  const db=await PGlite.create({extensions:{pgcrypto}});
  try{
    await db.exec(fs.readFileSync(path.join(root,"tests","tenantPlatform.fixture.sql"),"utf8"));
    const files=fs.readdirSync(dir).filter(x=>x.endsWith(".sql")).sort();
    assert.equal(files.at(-1),pendingFile);
    for(const file of files.filter(x=>x!==pendingFile)){
      let sql=fs.readFileSync(path.join(dir,file),"utf8");
      sql=sql.replace(/^(?:create|drop) extension if (?:not )?exists (?:pg_net|pg_cron)[^;]*;/gim,"");
      try{await db.exec(sql);}catch(err){throw Error("Baseline migration "+file+" failed: "+String(err));}
    }

    // A realistic pending usage row plus a distinct owner's settled entry.
    const pending="legacy:rehearsal-alice";
    const other="legacy:rehearsal-bob";
    await db.query(
      "insert into public.ai_usage_events(owner_principal,request_key,operation,model_id,status,provider_generation_id,reconciliation_note) values ($1,'rehearsal-alice-req','rewrite','openrouter/example','pending','gen-rehearsal001','AI_USAGE_UNVERIFIED'),($2,'rehearsal-bob-req','translate','openrouter/example','success','gen-rehearsal002','RESOLVED')",
      [pending,other]
    );
    await db.query(
      "update public.ai_usage_events set created_at=now()-interval '3 minutes' where owner_principal=$1",
      [pending]
    );
    await db.query(
      "insert into public.ai_unit_ledger(owner_principal,event_key,balance_type,event_kind,units_delta) values ($1,'rehearsal-grant','purchased','grant',20)",
      [pending]
    );
    const baseline=await db.query(
      "select owner_principal,request_key,status,units_charged::text from public.ai_usage_events order by owner_principal"
    );
    const ledgerBefore=await db.query(
      "select owner_principal,event_key,units_delta::text from public.ai_unit_ledger"
    );
    const migration=fs.readFileSync(path.join(dir,pendingFile),"utf8");
    const hasColumn=async()=>{
      const result=await db.query<{n:number}>(
        "select count(*)::int n from information_schema.columns where table_schema='public' and table_name='ai_usage_events' and column_name in ('reconciliation_attempts','reconciliation_next_attempt_at')"
      );
      return Number(result.rows[0].n);
    };
    assert.equal(await hasColumn(),0);

    // Transactional rollback rehearsal: schema and data must return unchanged.
    await db.exec("BEGIN");
    await db.exec(migration);
    assert.equal(await hasColumn(),2);
    await db.exec("ROLLBACK");
    assert.equal(await hasColumn(),0);
    assert.deepEqual((await db.query(
      "select owner_principal,request_key,status,units_charged::text from public.ai_usage_events order by owner_principal"
    )).rows,baseline.rows);

    // Disposable "commit": no live migration ledger or remote Supabase writes.
    await db.exec(migration);
    assert.equal(await hasColumn(),2);
    const fields=await db.query<{reconciliation_attempts:number}>(
      "select reconciliation_attempts from public.ai_usage_events where owner_principal=$1",
      [pending]
    );
    assert.equal(fields.rows[0].reconciliation_attempts,0);
    const constraint=await db.query<{exists:boolean}>(
      "select exists(select 1 from pg_constraint where conname='ai_usage_reconciliation_attempts_nonnegative') as exists"
    );
    assert.equal(constraint.rows[0].exists,true);
    const index=await db.query<{indexdef:string}>(
      "select indexdef from pg_indexes where schemaname='public' and indexname='ai_usage_reconciliation_pending_due_idx'"
    );
    assert.equal(index.rows.length,1);
    assert.match(index.rows[0].indexdef,/reconciliation_next_attempt_at/);
    assert.match(index.rows[0].indexdef,/provider_generation_id IS NOT NULL/i);
    assert.match(index.rows[0].indexdef,/reconciliation_note IS NOT NULL/i);
    await assert.rejects(db.query(
      "update public.ai_usage_events set reconciliation_attempts=-1 where owner_principal=$1",
      [pending]
    ));
    const rls=await db.query<{rls:boolean;anon:boolean;auth:boolean}>(
      "select c.relrowsecurity rls,has_table_privilege('anon',c.oid,'SELECT') anon,has_table_privilege('authenticated',c.oid,'SELECT') auth from pg_class c where c.oid='public.ai_usage_events'::regclass"
    );
    assert.deepEqual(rls.rows,[{rls:true,anon:false,auth:false}]);
    assert.deepEqual((await db.query(
      "select owner_principal,event_key,units_delta::text from public.ai_unit_ledger"
    )).rows,ledgerBefore.rows);

    // Exercise the ACTUAL worker's claim query using injected synthetic
    // provider responses. No network connection or real AI charge is allowed.
    let lookups=0;
    let settlements=0;
    const opts={
      apiKey:"SYNTHETIC_API_KEY_NOT_REAL",
      env:{TGREPOSTER_COMMERCIAL_AI_ENABLED:"true"},
      query:(sql:string,params:unknown[])=>db.query(sql,params as any[]),
      fetchGeneration:async(id:string)=>{
        lookups++;
        assert.equal(id,"gen-rehearsal001");
        return {generationId:id,costUsd:"0.0040000000",promptTokens:20,completionTokens:40};
      },
      settle:async(input:any)=>{
        settlements++;
        assert.equal(input.ownerPrincipal,pending);
        return {settled:true,requestId:"fixture-id",chargedUnits:"0.400000"};
      }
    };
    const once=await reconcilePendingOpenRouterUsage(opts);
    assert.deepEqual(once,{checked:1,settled:1,unresolved:0});
    const twice=await reconcilePendingOpenRouterUsage(opts);
    assert.deepEqual(twice,{checked:0,settled:0,unresolved:0});
    assert.equal(lookups,1);
    assert.equal(settlements,1);
    const post=await db.query<{reconciliation_attempts:number;future:boolean}>(
      "select reconciliation_attempts,reconciliation_next_attempt_at>now() future from public.ai_usage_events where owner_principal=$1",
      [pending]
    );
    assert.equal(post.rows[0].reconciliation_attempts,1);
    assert.equal(post.rows[0].future,true);

    // An unknown provider cost is not a refund: preserve the pending usage
    // hold, apply backoff and save only a known, non-sensitive operator code.
    const disputed="legacy:rehearsal-disputed";
    await db.query(
      "insert into public.ai_usage_events(owner_principal,request_key,operation,model_id,status,provider_generation_id,reconciliation_note,created_at) values ($1,'rehearsal-disputed-req','rewrite','openrouter/example','pending','gen-rehearsal003','AI_USAGE_UNVERIFIED',now()-interval '3 minutes')",
      [disputed]
    );
    const sensitive="PRIVATE_CUSTOMER_PROMPT_AND_PROVIDER_TOKEN";
    let failedLookups=0;
    let accidentalCharges=0;
    const failedOptions={
      apiKey:"SYNTHETIC_API_KEY_NOT_REAL",
      env:{TGREPOSTER_COMMERCIAL_AI_ENABLED:"true"},
      query:(sql:string,params:unknown[])=>db.query(sql,params as any[]),
      fetchGeneration:async()=>{
        failedLookups++;
        throw Error(sensitive);
      },
      settle:async()=>{
        accidentalCharges++;
        throw Error("Cannot charge disputed usage");
      },
      flag:async(owner:string,key:string,reason:string,generation?:string)=>{
        assert.equal(owner,disputed);
        assert.equal(key,"rehearsal-disputed-req");
        assert.equal(generation,"gen-rehearsal003");
        assert.equal(reason,"AI_GENERATION_COST_RETRY_PENDING");
        await db.query(
          "update public.ai_usage_events set reconciliation_note=$3 where owner_principal=$1 and request_key=$2",
          [owner,key,reason]
        );
      }
    };
    assert.deepEqual(await reconcilePendingOpenRouterUsage(failedOptions),
      {checked:1,settled:0,unresolved:1});
    assert.deepEqual(await reconcilePendingOpenRouterUsage(failedOptions),
      {checked:0,settled:0,unresolved:0});
    assert.equal(failedLookups,1);
    assert.equal(accidentalCharges,0);
    const disputedUsage=await db.query<{
      status:string;reconciliation_note:string;reconciliation_attempts:number;
      future:boolean;units_charged:string
    }>(
      "select status,reconciliation_note,reconciliation_attempts,reconciliation_next_attempt_at>now() future,units_charged::text from public.ai_usage_events where owner_principal=$1",
      [disputed]
    );
    assert.equal(disputedUsage.rows[0].status,"pending");
    assert.equal(disputedUsage.rows[0].reconciliation_note,"AI_GENERATION_COST_RETRY_PENDING");
    assert.equal(disputedUsage.rows[0].reconciliation_attempts,1);
    assert.equal(disputedUsage.rows[0].future,true);
    assert.equal(Number(disputedUsage.rows[0].units_charged),0);
    assert.ok(!JSON.stringify(disputedUsage.rows).includes(sensitive));

    assert.deepEqual((await db.query(
      "select owner_principal,event_key,units_delta::text from public.ai_unit_ledger"
    )).rows,ledgerBefore.rows);
  }finally{
    await db.close();
  }
});
