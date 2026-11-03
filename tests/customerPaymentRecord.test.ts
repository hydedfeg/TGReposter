import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { getCustomerPaymentRecord, PaymentRecordError } from "../server/billing/customerPaymentRecord";

const id = "10000000-0000-4000-8000-000000000001";
const invoice = "20000000-0000-4000-8000-000000000001";
const env = { CRYPTO_PAYMENTS_ENABLED: "true", CRYPTO_USDT_BSC_ENABLED: "true",
  CRYPTO_USDT_BSC_RPC_URL: "https://example.invalid/rpc", CRYPTO_USDT_BSC_CONFIRMATIONS: "120",
  CRYPTO_USDT_BSC_RECEIVING_ADDRESS: "0x2222222222222222222222222222222222222222" };
const code = (expected: string) => (error: unknown) => error instanceof PaymentRecordError && error.code === expected;

test("payment records require owner-matched payment and fulfillment evidence, preserving exact amounts", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table crypto_payment_invoices(id uuid primary key,owner_principal text,status text,confirmed_at timestamptz,
        network text,requested_amount numeric,expected_amount numeric,receiving_address text,token_identifier text);
      create table crypto_payment_transactions(owner_principal text,invoice_id uuid,status text,confirmed_at timestamptz,
        network text,amount numeric,confirmations int,to_address text,token_identifier text);
      create table billing_subscription_orders(id uuid,owner_principal text,invoice_id uuid,plan_id text,billing_interval text,
        status text,created_at timestamptz,fulfilled_at timestamptz,listed_eur_cents int,quoted_usdt_amount numeric);
      create table billing_subscription_terms(owner_principal text,order_id uuid,plan_id text,billing_interval text);
      create table billing_ai_topup_orders(id uuid,owner_principal text,invoice_id uuid,pack_id text,ai_units numeric,
        status text,created_at timestamptz,fulfilled_at timestamptz,listed_eur_cents int,quoted_usdt_amount numeric);
      create table ai_unit_ledger(owner_principal text,event_key text,balance_type text,event_kind text,units_delta numeric);
      insert into crypto_payment_invoices values('${invoice}','legacy:alice','paid','2026-11-01T12:00:00Z','bsc',16.5,16.500001,'0xABC','0xTOKEN');
      insert into crypto_payment_transactions values('legacy:alice','${invoice}','confirmed','2026-11-01T12:00:00Z','bsc',16.500001,120,'0xabc','0xtoken');
      insert into billing_subscription_orders values('${id}','legacy:alice','${invoice}','creator','monthly','fulfilled','2026-11-01T11:00:00Z','2026-11-01T12:01:00Z',1500,16.5);
      insert into billing_subscription_terms values('legacy:alice','${id}','creator','monthly');
      insert into crypto_payment_invoices select '20000000-0000-4000-8000-000000000002',owner_principal,status,confirmed_at,network,requested_amount,expected_amount,receiving_address,token_identifier from crypto_payment_invoices;
      insert into crypto_payment_transactions select owner_principal,'20000000-0000-4000-8000-000000000002',status,confirmed_at,network,amount,confirmations,to_address,token_identifier from crypto_payment_transactions;
      insert into billing_ai_topup_orders values('${id}','legacy:alice','20000000-0000-4000-8000-000000000002','mini',500,'fulfilled','2026-11-01T11:00:00Z','2026-11-01T12:01:00Z',700,16.5);
      insert into ai_unit_ledger values('legacy:alice','topup:order:${id}','purchased','grant',500);
    `);
    let released = 0;
    const options = { confirmationEnv: env, clientFactory: async () => ({
      query: (sql: string, args?: unknown[]) => db.query(sql, args as any), release: () => { released++; },
    }) as any };
    const get = (type = "subscription", owner = "legacy:alice") => getCustomerPaymentRecord(owner, type, id, options);
    const record = await get();
    assert.equal(record.payment.amount, "16.500001");
    assert.deepEqual(record.listedPrice, { currency: "EUR", amountMinor: 1500 });
    assert.equal(record.taxInvoice, false);
    assert.equal(record.productId, "creator");
    assert.doesNotMatch(JSON.stringify(record), /legacy:alice|0xabc|0xtoken|owner_principal|invoice_id/i);
    await assert.rejects(get("subscription", "legacy:bob"), code("PAYMENT_RECORD_NOT_FOUND"));
    for (const patch of ["confirmations=119", "amount=16.500002", "token_identifier='wrong'", "to_address='wrong'", "network='ethereum'", "owner_principal='legacy:bob'"]) {
      await db.exec(`update crypto_payment_transactions set ${patch} where invoice_id='${invoice}'`);
      await assert.rejects(get(), code("PAYMENT_RECORD_NOT_READY"));
      await db.exec("update crypto_payment_transactions set confirmations=120,amount=16.500001,token_identifier='0xtoken',to_address='0xabc',network='bsc',owner_principal='legacy:alice'");
    }
    await db.exec("update billing_subscription_orders set status='pending'");
    await assert.rejects(get(), code("PAYMENT_RECORD_NOT_READY"));
    await db.exec("update billing_subscription_orders set status='fulfilled',quoted_usdt_amount=17");
    await assert.rejects(get(), code("PAYMENT_RECORD_NOT_READY"));
    await db.exec("update billing_subscription_orders set quoted_usdt_amount=16.5; delete from billing_subscription_terms");
    await assert.rejects(get(), code("PAYMENT_RECORD_NOT_READY"));
    const topup = await get("topup");
    assert.equal(topup.aiUnits, "500");
    await db.exec("update ai_unit_ledger set owner_principal='legacy:bob'");
    await assert.rejects(get("topup"), code("PAYMENT_RECORD_NOT_READY"));
    await db.exec(`update ai_unit_ledger set owner_principal='legacy:alice'; update billing_ai_topup_orders set invoice_id='${invoice}'`);
    await assert.rejects(get("topup"), code("PAYMENT_RECORD_NOT_READY"));
    assert.ok(released >= 12);
    // Successful and failed reads never mutate the financial rows.
    const rows = await db.query<{ n: number }>("select count(*)::int n from crypto_payment_transactions");
    assert.equal(rows.rows[0].n, 2);
  } finally { await db.close(); }
});

test("malformed payment record identities are rejected before acquiring a connection", async () => {
  const options = { clientFactory: async () => { throw Error("must not connect"); } };
  for (const type of ["constructor", "__proto__", "subscription;drop table"]) {
    await assert.rejects(getCustomerPaymentRecord("legacy:alice", type, id, options), code("INVALID_PAYMENT_RECORD_REQUEST"));
  }
  await assert.rejects(getCustomerPaymentRecord("legacy:alice", "subscription", "invalid", options), code("INVALID_PAYMENT_RECORD_REQUEST"));
});
