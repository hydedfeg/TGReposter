import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createBillingOverviewRouter } from "../server/routes/billingOverview";
import { PaymentRecordError } from "../server/billing/customerPaymentRecord";
const id = "10000000-0000-4000-8000-000000000001";
test("payment-record downloads derive owner from the session and protect error and cache boundaries", async () => {
  let identity = true, database = true, failure = "", calls = 0;
  const app = express();
  app.use("/api/billing", createBillingOverviewRouter({
    authMiddleware: (req: any, _res, next) => {
      if (identity) req.user = { username: "Alice", authProvider: "legacy" };
      next();
    }, hasDatabase: () => database,
    loadPaymentRecord: (async (owner: string, type: string, orderId: string) => {
      calls++; assert.equal(owner, "legacy:alice"); assert.equal(type, "subscription"); assert.equal(orderId, id);
      if (failure === "internal") throw Error("private-db-error-with-secrets");
      if (failure) throw new PaymentRecordError(failure);
      return { orderId: id, documentType: "payment_record", taxInvoice: false };
    }) as any,
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/api/billing/orders/subscription/${id}/payment-record`;
  try {
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control")!, /private, no-store/);
    assert.equal(response.headers.get("vary"), "Authorization");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("content-disposition")!, /attachment.*\.json/);
    await response.json();
    const before = calls;
    const spoof = await fetch(url + "?owner_principal=legacy:bob");
    assert.equal(spoof.status, 400); assert.equal(calls, before); await spoof.json();
    identity = false;
    const anonymous = await fetch(url); assert.equal(anonymous.status, 401); await anonymous.json();
    assert.equal(calls, before); identity = true; database = false;
    const offline = await fetch(url); assert.equal(offline.status, 503); await offline.json();
    assert.equal(calls, before); database = true;
    for (const [code, status] of [["PAYMENT_RECORD_NOT_FOUND", 404], ["PAYMENT_RECORD_NOT_READY", 409], ["internal", 503]] as const) {
      failure = code;
      const rejected = await fetch(url); assert.equal(rejected.status, status);
      assert.doesNotMatch(await rejected.text(), /private-db-error|secrets/);
      assert.equal(rejected.headers.get("content-disposition"), null);
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
