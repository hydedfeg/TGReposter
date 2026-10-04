import test from "node:test";
import assert from "node:assert/strict";
import { CryptoPaymentWatcher } from "../server/payments/paymentWatcher";
import type { CryptoPaymentWatcherRepository } from "../server/payments/paymentWatcher";
import type { CryptoPaymentInvoiceRecord } from "../server/repositories/cryptoPaymentRepository";
import type {
  CryptoPaymentNetworkAdapter,
  CryptoPaymentNetworkConfig,
  CryptoPaymentTransferObservation,
  CryptoPaymentTransactionStatus,
} from "../server/payments/types";

const config: CryptoPaymentNetworkConfig = {
  id: "bsc",
  family: "evm",
  asset: "USDT",
  enabled: true,
  rpcUrl: "https://rpc.example.test",
  receivingAddress: "0x2222222222222222222222222222222222222222",
  tokenIdentifier: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  requiredConfirmations: 4,
  maxBlocksPerScan: 100,
};

function makeInvoice(): CryptoPaymentInvoiceRecord {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    owner_principal: "supabase:user-1",
    asset_code: "USDT",
    network: "bsc",
    expected_amount: "20.000000",
    receiving_address: config.receivingAddress,
    token_identifier: config.tokenIdentifier,
    status: "pending",
    expires_at: "2099-01-01T00:00:00.000Z",
    detected_at: null,
    confirmed_at: null,
    cancelled_at: null,
    created_at: "2026-10-04T00:00:00.000Z",
    updated_at: "2026-10-04T00:00:00.000Z",
  };
}

function observation(confirmations: number): CryptoPaymentTransferObservation {
  return {
    network: "bsc",
    txHash:
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    eventIndex: "0",
    tokenIdentifier: config.tokenIdentifier,
    fromAddress: "0x1111111111111111111111111111111111111111",
    toAddress: config.receivingAddress,
    amount: "20",
    blockReference: "100",
    confirmations,
    observedAt: "2026-10-04T00:00:00.000Z",
  };
}

test("payment watcher promotes the same transfer from confirming to paid", async () => {
  const invoice = makeInvoice();
  let cursor: string | null = null;
  let assignment: { ownerPrincipal: string; invoiceId: string } | null = null;
  let transactionStatus: CryptoPaymentTransactionStatus | null = null;
  let scanNumber = 0;
  const events: string[] = [];

  const adapter: CryptoPaymentNetworkAdapter = {
    network: "bsc",
    async scanTransfers() {
      scanNumber += 1;
      return {
        observations: [observation(scanNumber === 1 ? 2 : 4)],
        nextCursor: scanNumber === 1 ? "98" : "101",
        scannedFrom: scanNumber === 1 ? "95" : "98",
        scannedTo: scanNumber === 1 ? "100" : "103",
      };
    },
  };

  const repository: CryptoPaymentWatcherRepository = {
    async getNetworkCursor() {
      return cursor;
    },
    async saveNetworkCursor(input) {
      cursor = input.cursor;
    },
    async listOpenInvoicesForNetwork() {
      return invoice.status === "paid" ? [] : [invoice];
    },
    async getTransactionAssignment() {
      return assignment;
    },
    async getInvoice() {
      return invoice;
    },
    async upsertObservedTransfer(ownerPrincipal, invoiceId, _observation, status) {
      transactionStatus = status;
      assignment = { ownerPrincipal, invoiceId };
      return "00000000-0000-0000-0000-000000000002";
    },
    async appendEvent(input) {
      events.push(input.eventType);
      return true;
    },
    async updateInvoiceStatus(_ownerPrincipal, _invoiceId, status) {
      invoice.status = status;
      return invoice;
    },
  };

  const watcher = new CryptoPaymentWatcher(config, adapter, repository);

  const first = await watcher.runOnce();
  assert.equal(first.confirming, 1);
  assert.equal(first.confirmed, 0);
  assert.equal(invoice.status, "confirming");
  assert.equal(transactionStatus, "confirming");
  assert.equal(cursor, "98");

  const second = await watcher.runOnce();
  assert.equal(second.confirmed, 1);
  assert.equal(invoice.status, "paid");
  assert.equal(transactionStatus, "confirmed");
  assert.equal(cursor, "101");
  assert.deepEqual(events, ["transfer_detected", "transfer_confirmed"]);
});

test("payment watcher refuses ambiguous same-amount open invoices", async () => {
  const invoiceA = makeInvoice();
  const invoiceB = {
    ...makeInvoice(),
    id: "00000000-0000-0000-0000-000000000003",
    owner_principal: "supabase:user-2",
  };
  let upsertCalls = 0;
  let savedCursor: string | null = null;

  const adapter: CryptoPaymentNetworkAdapter = {
    network: "bsc",
    async scanTransfers() {
      return {
        observations: [observation(4)],
        nextCursor: "101",
      };
    },
  };

  const repository: CryptoPaymentWatcherRepository = {
    async getNetworkCursor() {
      return null;
    },
    async saveNetworkCursor(input) {
      savedCursor = input.cursor;
    },
    async listOpenInvoicesForNetwork() {
      return [invoiceA, invoiceB];
    },
    async getTransactionAssignment() {
      return null;
    },
    async getInvoice() {
      return null;
    },
    async upsertObservedTransfer() {
      upsertCalls += 1;
      return "unexpected";
    },
    async appendEvent() {
      return true;
    },
    async updateInvoiceStatus() {
      throw new Error("ambiguous invoice must not be updated");
    },
  };

  const result = await new CryptoPaymentWatcher(config, adapter, repository).runOnce();
  assert.equal(result.ambiguous, 1);
  assert.equal(result.matched, 0);
  assert.equal(upsertCalls, 0);
  assert.equal(savedCursor, "101");
});

test("payment watcher does not reuse a transfer assigned to a terminal invoice", async () => {
  const paidInvoice = { ...makeInvoice(), status: "paid" as const };
  let upsertCalls = 0;

  const adapter: CryptoPaymentNetworkAdapter = {
    network: "bsc",
    async scanTransfers() {
      return {
        observations: [observation(10)],
        nextCursor: "120",
      };
    },
  };

  const repository: CryptoPaymentWatcherRepository = {
    async getNetworkCursor() {
      return "110";
    },
    async saveNetworkCursor() {},
    async listOpenInvoicesForNetwork() {
      return [makeInvoice()];
    },
    async getTransactionAssignment() {
      return {
        ownerPrincipal: paidInvoice.owner_principal,
        invoiceId: paidInvoice.id,
      };
    },
    async getInvoice() {
      return paidInvoice;
    },
    async upsertObservedTransfer() {
      upsertCalls += 1;
      return "unexpected";
    },
    async appendEvent() {
      return true;
    },
    async updateInvoiceStatus() {
      throw new Error("paid invoice must not be updated");
    },
  };

  const result = await new CryptoPaymentWatcher(config, adapter, repository).runOnce();
  assert.equal(result.replayed, 1);
  assert.equal(upsertCalls, 0);
});
