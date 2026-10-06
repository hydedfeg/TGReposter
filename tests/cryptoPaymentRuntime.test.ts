import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getCryptoPaymentRuntimeStatus,
  scanConfiguredCryptoPayments,
} from "../server/payments/paymentRuntime";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("crypto payment runtime is inert while disabled", async () => {
  assert.deepEqual(getCryptoPaymentRuntimeStatus({}), {
    enabled: false,
    networks: [],
  });

  assert.deepEqual(await scanConfiguredCryptoPayments({}), {
    enabled: false,
    networks: [],
  });
});

test("crypto payment status exposes capabilities but not infrastructure secrets", () => {
  const env = {
    CRYPTO_PAYMENTS_ENABLED: "true",
    CRYPTO_USDT_BSC_ENABLED: "true",
    CRYPTO_USDT_BSC_RPC_URL: "https://secret-rpc.example.test/api-key",
    CRYPTO_USDT_BSC_RECEIVING_ADDRESS:
      "0x2222222222222222222222222222222222222222",
    CRYPTO_USDT_BSC_TOKEN_IDENTIFIER:
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    CRYPTO_USDT_BSC_CONFIRMATIONS: "4",
    CRYPTO_USDT_BSC_MAX_BLOCKS_PER_SCAN: "500",
  };

  const status = getCryptoPaymentRuntimeStatus(env);
  assert.deepEqual(status, {
    enabled: true,
    networks: [
      {
        id: "bsc",
        family: "evm",
        asset: "USDT",
        requiredConfirmations: 4,
        maxBlocksPerScan: 500,
      },
    ],
  });

  const serialized = JSON.stringify(status);
  assert.doesNotMatch(serialized, /secret-rpc/);
  assert.doesNotMatch(serialized, /2222222222222222222222222222222222222222/);
  assert.doesNotMatch(serialized, /aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/);
});

test("crypto payment operations are mounted behind auth and super-admin checks", () => {
  const server = fs.readFileSync(path.join(repoRoot, "server.ts"), "utf8");
  const route = fs.readFileSync(
    path.join(repoRoot, "server/routes/cryptoPayments.ts"),
    "utf8"
  );

  assert.match(
    server,
    /app\.use\("\/api\/crypto-payments", createCryptoPaymentRouter\(\{[\s\S]*?authMiddleware,[\s\S]*?requireSuperAdmin,[\s\S]*?\}\)\);/
  );
  assert.match(route, /router\.use\(authMiddleware\);/);
  assert.match(route, /router\.use\(requireSuperAdmin\);/);
  assert.match(route, /router\.get\("\/status"/);
  assert.match(route, /router\.post\("\/scan"/);
});

test("infrastructure invoice endpoints stay super-admin-only until sales plans exist", () => {
  const route = fs.readFileSync(
    path.join(repoRoot, "server/routes/cryptoPayments.ts"),
    "utf8"
  );

  assert.match(route, /router\.use\(requireSuperAdmin\);/);
  assert.match(route, /router\.post\("\/invoices"/);
  assert.match(route, /router\.get\("\/invoices\/:id"/);
  assert.match(route, /router\.post\("\/invoices\/:id\/cancel"/);
  assert.match(route, /ownerPrincipalForUser\(req\.user\)/);
});
