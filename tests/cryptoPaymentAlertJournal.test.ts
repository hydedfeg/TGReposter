import test from "node:test";
import assert from "node:assert/strict";
import {
  reconcileCryptoPaymentAlertJournal,
  deliverCryptoPaymentAlerts,
  isPaymentAlertTelegramConfigured,
} from "../server/payments/paymentAlertJournal";

const env = { CRYPTO_PAYMENT_ALERTS_ENABLED: "true" };
const fakeOverview = (values: any = {}) => ({
  reconciliation: {
    alerts: [], truncated: false,
    ...values.reconciliation,
  },
  unassignedTransfers: {
    items: [], truncated: false,
    ...values.unassignedTransfers,
  },
});
function makePool(queries: Array<{ sql: string; params?: unknown[] }>, rows: any[] = []) {
  return {
    async query(sql: string, params?: unknown[]) {
      queries.push({ sql, params });
      return { rows, rowCount: 1 };
    },
    async connect() {
      return {
        async query(sql: string, params?: unknown[]) {
          queries.push({ sql, params });
          return { rows: [], rowCount: sql.includes("update public.crypto_payment_operational_alerts") ? 0 : 1 };
        },
        release() {},
      };
    },
  } as any;
}

test("disabled journal writes nothing", async () => {
  const queries: any[] = [];
  const result = await reconcileCryptoPaymentAlertJournal({}, undefined as any, makePool(queries));
  assert.deepEqual(result, { openedOrUpdated: 0, resolved: 0, truncated: false });
  assert.equal(queries.length, 0);
});

test("background alerts deduplicate by network/code/invoice and do not infer an owner", async () => {
  const queries: any[] = [];
  const data = fakeOverview({
    reconciliation: { alerts: [
      { code: "scanner_delayed", severity: "warning", network: "bsc", invoiceId: null, ownerPrincipal: null },
      { code: "invoice_exception", severity: "warning", network: "ethereum",
        invoiceId: "00000000-0000-0000-0000-000000000001", ownerPrincipal: "supabase:test" },
    ]},
    unassignedTransfers: { items: [{
      network: "ton", tx_hash: "0xabc", event_index: "3", reason: "unmatched"
    }]},
  });
  const result = await reconcileCryptoPaymentAlertJournal(env, (async () => data) as any, makePool(queries));
  assert.equal(result.openedOrUpdated, 3);
  const inserts = queries.filter(q => q.sql.includes("insert into public.crypto_payment_operational_alerts"));
  assert.equal(inserts.length, 3);
  assert.deepEqual(inserts.map(q => q.params[0]), [
    "scanner:bsc:scanner_delayed",
    "invoice:ethereum:invoice_exception:supabase:test:00000000-0000-0000-0000-000000000001",
    "unassigned:ton:0xabc:3",
  ]);
  assert.equal(inserts[0].params[5], null);
  assert.equal(inserts[2].params[5], null);
  assert.ok(inserts.every(q => q.params[8] === "skipped"));
  assert.ok(queries.some(q => q.sql.toLowerCase() === "commit"));
});

test("truncated observations cannot silently resolve invisible active alerts", async () => {
  const queries: any[] = [];
  const data = fakeOverview({reconciliation: {truncated:true}, unassignedTransfers: {truncated:true}});
  const result = await reconcileCryptoPaymentAlertJournal(env, (async () => data) as any, makePool(queries));
  const resolve = queries.find(q => q.sql.includes("not (category=any("));
  assert.ok(resolve);
  assert.deepEqual(resolve.params[1], ["invoice", "unassigned"]);
  assert.equal(result.truncated, true);
});

test("unconfigured Telegram delivery never calls fetch or sends stored secrets", async () => {
  const queries: any[] = [];
  let fetchCalls = 0;
  const send = (async () => { fetchCalls += 1; throw Error("unexpected"); }) as any;
  const result = await deliverCryptoPaymentAlerts(env, makePool(queries), send);
  assert.deepEqual(result, { sent: 0, failed: 0 });
  assert.equal(fetchCalls, 0);
  assert.equal(queries.length, 0);
  assert.equal(isPaymentAlertTelegramConfigured({
    CRYPTO_PAYMENT_ALERT_TELEGRAM_ENABLED:"true",
    CRYPTO_PAYMENT_ALERT_TELEGRAM_BOT_TOKEN:"missing",
    CRYPTO_PAYMENT_ALERT_TELEGRAM_CHAT_ID:"-42",
  }), false);
});

test("opt-in Telegram delivery sends redacted message once, then marks sent", async () => {
  const queries: any[] = [];
  let body: any;
  const send = (async (_url: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return { ok:true };
  }) as any;
  const pool = { async query(sql: string, params?: unknown[]) {
    queries.push({sql,params});
    if (sql.includes("select id, code, severity, network")) {
      return { rows: [{id:1,code:"invoice_exception",network:"bsc",severity:"warning",attempts:0}] };
    }
    return { rows:[],rowCount:1 };
  }} as any;
  const activeEnv = {
    ...env, CRYPTO_PAYMENT_ALERT_TELEGRAM_ENABLED:"true",
    CRYPTO_PAYMENT_ALERT_TELEGRAM_BOT_TOKEN:"123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    CRYPTO_PAYMENT_ALERT_TELEGRAM_CHAT_ID:"-123456789",
  };
  assert.equal(isPaymentAlertTelegramConfigured(activeEnv),true);
  const result = await deliverCryptoPaymentAlerts(activeEnv,pool,send);
  assert.deepEqual(result,{sent:1,failed:0});
  assert.equal(body.chat_id,"-123456789");
  assert.ok(!body.text.includes(activeEnv.CRYPTO_PAYMENT_ALERT_TELEGRAM_BOT_TOKEN));
  assert.ok(!body.text.includes("supabase:"));
  assert.ok(queries.some(q => q.sql.includes("notification_state='sent'")));
});
