import test from "node:test";
import assert from "node:assert/strict";
import { CryptoPaymentInvoiceService } from "../server/payments/invoiceService";
import type { CryptoPaymentInvoiceRecord } from "../server/repositories/cryptoPaymentRepository";

const env = {
  CRYPTO_PAYMENTS_ENABLED: "true",
  CRYPTO_USDT_BSC_ENABLED: "true",
  CRYPTO_USDT_BSC_RPC_URL: "https://rpc.example.test",
  CRYPTO_USDT_BSC_RECEIVING_ADDRESS:
    "0x2222222222222222222222222222222222222222",
  CRYPTO_USDT_BSC_TOKEN_IDENTIFIER:
    "0x55d398326f99059ff775485246999027b3197955",
  CRYPTO_USDT_BSC_CONFIRMATIONS: "4",
  CRYPTO_USDT_BSC_MAX_BLOCKS_PER_SCAN: "500",
  CRYPTO_PAYMENT_REQUEST_TIMEOUT_MS: "10000",
  CRYPTO_PAYMENT_AMOUNT_DISCRIMINATOR_DIGITS: "4",
  CRYPTO_PAYMENT_AMOUNT_REUSE_DELAY_MS: "86400000",
};

function invoice(expectedAmount: string): CryptoPaymentInvoiceRecord {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    owner_principal: "supabase:user-1",
    asset_code: "USDT",
    network: "bsc",
    expected_amount: expectedAmount,
    receiving_address: env.CRYPTO_USDT_BSC_RECEIVING_ADDRESS,
    token_identifier: env.CRYPTO_USDT_BSC_TOKEN_IDENTIFIER,
    status: "pending",
    expires_at: "2026-10-07T12:00:00.000Z",
    detected_at: null,
    confirmed_at: null,
    cancelled_at: null,
    created_at: "2026-10-06T12:00:00.000Z",
    updated_at: "2026-10-06T12:00:00.000Z",
  };
}

test("invoice allocator retries a colliding amount atomically", async () => {
  const candidates: string[] = [];
  let attempts = 0;

  const repository = {
    async tryCreateReservedInvoice(
      _ownerPrincipal: string,
      input: { expectedAmount: string }
    ) {
      attempts += 1;
      candidates.push(input.expectedAmount);
      return attempts === 1 ? null : invoice(input.expectedAmount);
    },
    async getInvoice() {
      return null;
    },
    async updateInvoiceStatus() {
      return null;
    },
  };

  const service = new CryptoPaymentInvoiceService({
    repository: repository as any,
    env,
    now: () => Date.parse("2026-10-06T12:00:00.000Z"),
    randomStartSlot: () => 3827,
    createAdapter: () => ({
      async getAssetDecimals() {
        return 6;
      },
    }),
  });

  const result = await service.createInvoice("SUPABASE:USER-1", {
    network: "bsc",
    baseAmount: "20.00",
    expiresAt: "2026-10-07T12:00:00.000Z",
  });

  assert.equal(result.expected_amount, "20.003828");
  assert.deepEqual(candidates, ["20.003827", "20.003828"]);
});

test("invoice allocator rejects disabled networks and expired invoices", async () => {
  const service = new CryptoPaymentInvoiceService({
    repository: {
      async tryCreateReservedInvoice() {
        throw new Error("must not create");
      },
      async getInvoice() {
        return null;
      },
      async updateInvoiceStatus() {
        return null;
      },
    } as any,
    env: {},
    now: () => Date.parse("2026-10-06T12:00:00.000Z"),
    randomStartSlot: () => 1,
    createAdapter: () => ({
      async getAssetDecimals() {
        return 6;
      },
    }),
  });

  await assert.rejects(
    () =>
      service.createInvoice("supabase:user-1", {
        network: "bsc",
        baseAmount: "20",
        expiresAt: "2026-10-07T12:00:00.000Z",
      }),
    /not enabled/
  );

  const enabledService = new CryptoPaymentInvoiceService({
    repository: {
      async tryCreateReservedInvoice() {
        throw new Error("must not create");
      },
      async getInvoice() {
        return null;
      },
      async updateInvoiceStatus() {
        return null;
      },
    } as any,
    env,
    now: () => Date.parse("2026-10-06T12:00:00.000Z"),
    randomStartSlot: () => 1,
    createAdapter: () => ({
      async getAssetDecimals() {
        return 6;
      },
    }),
  });

  await assert.rejects(
    () =>
      enabledService.createInvoice("supabase:user-1", {
        network: "bsc",
        baseAmount: "20",
        expiresAt: "2026-10-06T11:59:59.000Z",
      }),
    /expiry must be in the future/
  );
});
