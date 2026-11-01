import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { maintainCryptoPaymentInvoices } from "../server/payments/paymentMaintenance";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("payment lifecycle maintenance delegates to the repository", async () => {
  let calls = 0;
  const result = await maintainCryptoPaymentInvoices({
    async expireStaleInvoicesAndReleaseReservations() {
      calls += 1;
      return {
        expiredInvoices: 3,
        releasedReservations: 5,
      };
    },
  });

  assert.equal(calls, 1);
  assert.deepEqual(result, {
    expiredInvoices: 3,
    releasedReservations: 5,
  });
});

test("payment lifecycle expires only pending invoices after reservation quarantine", () => {
  const repository = fs.readFileSync(
    path.join(repoRoot, "server/repositories/cryptoPaymentRepository.ts"),
    "utf8"
  );

  assert.match(repository, /reservation\.reserved_until <= now\(\)/);
  assert.match(repository, /invoice\.status = 'pending'/);
  assert.match(repository, /'invoice_expired'/);
  assert.match(repository, /delete from public\.crypto_payment_amount_reservations/);
  assert.match(
    repository,
    /invoice\.status = any\([\s\S]*?'paid'[\s\S]*?'expired'[\s\S]*?'cancelled'/
  );
});

test("automatic payment scan performs lifecycle maintenance after chain scan", () => {
  const scheduler = fs.readFileSync(
    path.join(repoRoot, "server/payments/paymentScheduler.ts"),
    "utf8"
  );

  const scanIndex = scheduler.indexOf("scanConfiguredCryptoPayments(env)");
  const maintenanceIndex = scheduler.indexOf("maintainCryptoPaymentInvoices()");

  assert.ok(scanIndex >= 0);
  assert.ok(maintenanceIndex > scanIndex);
});
