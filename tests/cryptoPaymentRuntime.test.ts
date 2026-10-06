import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getCryptoPaymentRuntimeStatus,
  preflightConfiguredCryptoPayments,
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
      "0x55d398326f99059ff775485246999027b3197955",
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
        assetProvenance: "bnb-chain-usdt-representation",
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
  assert.match(route, /router\.post\("\/preflight"/);
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
  assert.match(route, /req\.get\("Idempotency-Key"\)/);
});

test("crypto payment preflight validates asset metadata without exposing infrastructure", async () => {
  const env = {
    CRYPTO_PAYMENTS_ENABLED: "true",
    CRYPTO_USDT_BSC_ENABLED: "true",
    CRYPTO_USDT_BSC_RPC_URL: "https://secret-rpc.example.test/api-key",
    CRYPTO_USDT_BSC_RECEIVING_ADDRESS:
      "0x2222222222222222222222222222222222222222",
    CRYPTO_USDT_BSC_TOKEN_IDENTIFIER:
      "0x55d398326f99059ff775485246999027b3197955",
    CRYPTO_USDT_BSC_CONFIRMATIONS: "4",
    CRYPTO_USDT_BSC_MAX_BLOCKS_PER_SCAN: "500",
  };

  let adapterCalls = 0;
  const result = await preflightConfiguredCryptoPayments(
    env,
    () => ({
      async getAssetDecimals() {
        adapterCalls += 1;
        return 18;
      },
    })
  );

  assert.equal(adapterCalls, 1);
  assert.deepEqual(result, {
    enabled: true,
    networks: [
      {
        network: "bsc",
        ok: true,
        asset: "USDT",
        assetProvenance: "bnb-chain-usdt-representation",
        assetDecimals: 18,
      },
    ],
  });

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /secret-rpc/);
  assert.doesNotMatch(
    serialized,
    /2222222222222222222222222222222222222222/
  );
  assert.doesNotMatch(
    serialized,
    /55d398326f99059ff775485246999027b3197955/
  );
});

test("crypto payment preflight isolates network validation failures", async () => {
  const env = {
    CRYPTO_PAYMENTS_ENABLED: "true",
    CRYPTO_USDT_BSC_ENABLED: "true",
    CRYPTO_USDT_BSC_RPC_URL: "https://rpc.example.test",
    CRYPTO_USDT_BSC_RECEIVING_ADDRESS:
      "0x2222222222222222222222222222222222222222",
    CRYPTO_USDT_BSC_CONFIRMATIONS: "4",
  };

  const result = await preflightConfiguredCryptoPayments(
    env,
    () => ({
      async getAssetDecimals() {
        throw new Error("chain validation failed");
      },
    })
  );

  assert.equal(result.enabled, true);
  assert.equal(result.networks.length, 1);
  assert.equal(result.networks[0].ok, false);
  assert.equal(result.networks[0].error, "chain validation failed");
});

test("preflight runs while scheduler switches remain disabled", async () => {
  const env = {
    CRYPTO_PAYMENTS_ENABLED: "false",
    CRYPTO_USDT_BSC_ENABLED: "false",
    CRYPTO_USDT_BSC_RPC_URL: "https://rpc.example.test",
    CRYPTO_USDT_BSC_RECEIVING_ADDRESS:
      "0x2222222222222222222222222222222222222222",
    CRYPTO_USDT_BSC_CONFIRMATIONS: "120",
  };

  const result = await preflightConfiguredCryptoPayments(
    env,
    () => ({
      async getAssetDecimals() {
        return 18;
      },
    })
  );

  assert.equal(result.enabled, true);
  assert.equal(result.networks[0].network, "bsc");
  assert.equal(result.networks[0].ok, true);

  assert.deepEqual(getCryptoPaymentRuntimeStatus(env), {
    enabled: false,
    networks: [],
  });
});
