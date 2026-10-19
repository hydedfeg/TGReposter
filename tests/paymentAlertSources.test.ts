import test from "node:test";
import assert from "node:assert/strict";
import {
  loadCryptoPaymentAlertSources, PaymentAlertMonitoringError,
  safeAlertSqlstate,
} from "../server/payments/paymentAlertSources";
import { reconcileCryptoPaymentAlertJournal } from "../server/payments/paymentAlertJournal";

const now=new Date("2026-10-19T12:00:00Z");
const enabled={
  CRYPTO_PAYMENT_ALERTS_ENABLED:"true",
  CRYPTO_PAYMENTS_ENABLED:"true",
  CRYPTO_USDT_BSC_ENABLED:"true",
  CRYPTO_USDT_BSC_RPC_URL:"https://secret-rpc.invalid/private",
  CRYPTO_USDT_BSC_RECEIVING_ADDRESS:"0x2222222222222222222222222222222222222222",
  CRYPTO_USDT_BSC_CONFIRMATIONS:"120",
};

function sourceRows(sql:string){
  if(sql.includes("from public.crypto_payment_network_state"))
    return {rows:[{
      network:"bsc",receiving_address:enabled.CRYPTO_USDT_BSC_RECEIVING_ADDRESS,
      token_identifier:"0x55d398326f99059ff775485246999027b3197955",
      last_scanned_at:"2026-10-19T11:59:00Z",
    }]};
  if(sql.includes("with issues as"))return {rows:[]};
  if(sql.includes("from public.crypto_payment_unassigned_transfers"))
    return {rows:[]};
  throw Error("Unexpected query: must use exactly three alert inputs");
}

test("background alert reconciliation reads only three bounded sources, not dashboard history",async()=>{
  const queries:string[]=[];
  const result=await loadCryptoPaymentAlertSources(async(sql)=>{
    queries.push(sql);
    return sourceRows(sql);
  },enabled,now);
  assert.equal(queries.length,3);
  assert.ok(queries[0].includes("crypto_payment_network_state"));
  assert.ok(queries[1].includes("with issues as"));
  assert.ok(queries[2].includes("crypto_payment_unassigned_transfers"));
  assert.deepEqual(result.reconciliation.alerts,[]);
  assert.deepEqual(result.unassignedTransfers,{items:[],truncated:false});
  assert.ok(queries.every(x=>/^\s*(select|with)\s/i.test(x)));
  assert.ok(queries.every(x=>!x.includes("crypto_payment_operational_alerts")));
  assert.doesNotMatch(JSON.stringify(result),/secret-rpc|222222222222222222222222/);
});

test("one failed alert read aborts before any journal writes and reveals only a stage and SQLSTATE",async()=>{
  for(const [failAt,stage] of [
    [0,"network_state"],[1,"invoice_reconciliation"],[2,"unassigned_transfers"]
  ] as const){
    let call=0;
    let journalWrites=0;
    const db:any={
      async query(sql:string){
        const index=call++;
        if(index===failAt){
          throw Object.assign(new Error(
            "secret-rpc.invalid?apikey=SECRET and owner=supabase:private-user"
          ),{code:"XX000"});
        }
        return sourceRows(sql);
      },
      async connect(){journalWrites++;throw Error("Should never start journal");}
    };
    await assert.rejects(
      reconcileCryptoPaymentAlertJournal(enabled,loadCryptoPaymentAlertSources,db),
      err=>{
        assert.ok(err instanceof PaymentAlertMonitoringError);
        assert.equal(err.stage,stage);
        assert.equal(err.code,"XX000");
        assert.equal(err.message,"Payment alert monitoring operation failed.");
        assert.doesNotMatch(JSON.stringify(err),/SECRET|secret-rpc|supabase:private-user/);
        return true;
      }
    );
    assert.equal(journalWrites,0);
    assert.equal(call,failAt+1);
  }
});

test("journal upsert error rolls back instead of resolving alerts from incomplete records",async()=>{
  const operations:string[]=[];
  const secret="private provider URL https://secret.example/token";
  const pool:any={
    async query(_sql:string){return {rows:[],rowCount:0};},
    async connect(){return {
      async query(sql:string){
        operations.push(sql.trim().toLowerCase());
        if(sql.includes("insert into public.crypto_payment_operational_alerts"))
          throw Object.assign(new Error(secret),{code:"XX000"});
        return {rows:[],rowCount:0};
      },
      release(){operations.push("release");}
    };}
  };
  const overview:any=async()=>({
    reconciliation:{truncated:false,alerts:[{
      code:"scanner_delayed",severity:"warning",network:"ton",
      invoiceId:null,ownerPrincipal:null
    }]},
    unassignedTransfers:{items:[],truncated:false},
  });
  await assert.rejects(reconcileCryptoPaymentAlertJournal(enabled,overview,pool),err=>{
    assert.ok(err instanceof PaymentAlertMonitoringError);
    assert.equal(err.stage,"journal_upsert");
    assert.equal(err.code,"XX000");
    assert.doesNotMatch(JSON.stringify(err),/secret|private|token/i);
    return true;
  });
  assert.equal(operations[0],"begin");
  assert.equal(operations.at(-2),"rollback");
  assert.equal(operations.at(-1),"release");
  assert.ok(!operations.some(x=>x.startsWith("update public.crypto_payment_operational_alerts")));
});

test("SQLSTATE error sanitizer ignores arbitrary provider messages and non-standard codes",()=>{
  assert.equal(safeAlertSqlstate({code:"XX000",message:"secret"}),"XX000");
  assert.equal(safeAlertSqlstate({code:"P0001"}),"P0001");
  for(const error of [null,{},new Error("secret"),{code:"malicious leak"},
    {code:"TOKEN12345"},{code:18}]){
    assert.equal(safeAlertSqlstate(error),"UNKNOWN");
  }
});
