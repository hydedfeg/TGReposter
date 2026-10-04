import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_CRYPTO_PAYMENT_SCAN_INTERVAL_MS,
  MIN_CRYPTO_PAYMENT_SCAN_INTERVAL_MS,
  parseCryptoPaymentScanIntervalMs,
  startCryptoPaymentScheduler,
} from "../server/payments/paymentScheduler";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const enabledEnv = {
  DATABASE_URL: "postgresql://example.invalid/tgreposter",
  CRYPTO_PAYMENTS_ENABLED: "true",
  CRYPTO_USDT_BSC_ENABLED: "true",
  CRYPTO_USDT_BSC_RPC_URL: "https://rpc.example.test",
  CRYPTO_USDT_BSC_RECEIVING_ADDRESS:
    "0x2222222222222222222222222222222222222222",
  CRYPTO_USDT_BSC_TOKEN_IDENTIFIER:
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  CRYPTO_USDT_BSC_CONFIRMATIONS: "4",
  CRYPTO_USDT_BSC_MAX_BLOCKS_PER_SCAN: "500",
};

test("crypto payment scan interval is bounded", () => {
  assert.equal(
    parseCryptoPaymentScanIntervalMs(),
    DEFAULT_CRYPTO_PAYMENT_SCAN_INTERVAL_MS
  );
  assert.equal(
    parseCryptoPaymentScanIntervalMs(
      String(MIN_CRYPTO_PAYMENT_SCAN_INTERVAL_MS)
    ),
    MIN_CRYPTO_PAYMENT_SCAN_INTERVAL_MS
  );
  assert.throws(
    () =>
      parseCryptoPaymentScanIntervalMs(
        String(MIN_CRYPTO_PAYMENT_SCAN_INTERVAL_MS - 1)
      ),
    /must be an integer/
  );
});

test("crypto payment scheduler creates no timer while payments are disabled", () => {
  let timerCalls = 0;
  let scanCalls = 0;

  const stop = startCryptoPaymentScheduler({
    env: {},
    runLockedScan: async () => {
      scanCalls += 1;
      return { acquired: true };
    },
    setIntervalFn: () => {
      timerCalls += 1;
      return {};
    },
    logger: {
      info() {},
      warn() {},
      error() {},
    },
  });

  stop();
  assert.equal(timerCalls, 0);
  assert.equal(scanCalls, 0);
});

test("crypto payment scheduler requires the normalized database backend", () => {
  let timerCalls = 0;
  const warnings: unknown[][] = [];

  const stop = startCryptoPaymentScheduler({
    env: {
      ...enabledEnv,
      DATABASE_URL: undefined,
    },
    setIntervalFn: () => {
      timerCalls += 1;
      return {};
    },
    logger: {
      info() {},
      warn(...args) {
        warnings.push(args);
      },
      error() {},
    },
  });

  stop();
  assert.equal(timerCalls, 0);
  assert.equal(warnings.length, 1);
});

test("crypto payment scheduler scans immediately and serializes local ticks", async () => {
  let intervalCallback: (() => void) | null = null;
  let intervalMs = 0;
  let clearCalls = 0;
  let unrefCalls = 0;
  let scanCalls = 0;
  let releaseFirstScan: (() => void) | null = null;

  const firstScan = new Promise<void>((resolve) => {
    releaseFirstScan = resolve;
  });

  const stop = startCryptoPaymentScheduler({
    env: {
      ...enabledEnv,
      CRYPTO_PAYMENT_SCAN_INTERVAL_MS: "20000",
    },
    runLockedScan: async () => {
      scanCalls += 1;
      if (scanCalls === 1) {
        await firstScan;
      }
      return {
        acquired: true,
        result: {
          enabled: true,
          networks: [],
        },
      };
    },
    setIntervalFn: (callback, ms) => {
      intervalCallback = callback;
      intervalMs = ms;
      return {
        unref() {
          unrefCalls += 1;
        },
      };
    },
    clearIntervalFn: () => {
      clearCalls += 1;
    },
    logger: {
      info() {},
      warn() {},
      error() {},
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(scanCalls, 1);
  assert.equal(intervalMs, 20000);
  assert.equal(unrefCalls, 1);

  intervalCallback?.();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(scanCalls, 1);

  releaseFirstScan?.();
  await new Promise((resolve) => setImmediate(resolve));

  intervalCallback?.();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(scanCalls, 2);

  stop();
  stop();
  assert.equal(clearCalls, 1);
});

test("payment scheduler uses a PostgreSQL advisory lock", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "server/payments/paymentScheduler.ts"),
    "utf8"
  );

  assert.match(source, /pg_try_advisory_lock/);
  assert.match(source, /pg_advisory_unlock/);
  assert.match(source, /client\.release\(\)/);

  const server = fs.readFileSync(path.join(repoRoot, "server.ts"), "utf8");
  assert.match(server, /startCryptoPaymentScheduler\(\);/);
});
