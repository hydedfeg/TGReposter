import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getCryptoPaymentRuntimeStatus,
  preflightConfiguredCryptoPayments,
  runCryptoPaymentStartupPreflight,
  scanConfiguredCryptoPayments,
} from "../server/payments/paymentRuntime";
import { TonScanRateLimitBackoff } from "../server/payments/tonScanRateLimitBackoff";
import { TonCenterRateLimitError } from "../server/payments/tonCenterUsdtAdapter";

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
  assert.equal(result.networks[0].errorCode, "SCAN_FAILED");
  assert.equal(result.networks[0].error, "Blockchain payment scanner encountered an unexpected error.");
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

test("startup preflight is inert unless explicitly enabled", async () => {
  let adapterCalls = 0;
  const result = await runCryptoPaymentStartupPreflight(
    {},
    {
      info() {},
      warn() {},
      error() {},
    },
    () => ({
      async getAssetDecimals() {
        adapterCalls += 1;
        return 18;
      },
    })
  );

  assert.equal(result, null);
  assert.equal(adapterCalls, 0);
});

test("startup preflight validates disabled BSC without exposing payment identity", async () => {
  const logs: unknown[] = [];
  const env = {
    CRYPTO_PAYMENT_PREFLIGHT_ON_STARTUP: "true",
    CRYPTO_PAYMENTS_ENABLED: "false",
    CRYPTO_USDT_BSC_ENABLED: "false",
    CRYPTO_USDT_BSC_RPC_URL: "https://secret-rpc.example.test",
    CRYPTO_USDT_BSC_RECEIVING_ADDRESS:
      "0x2222222222222222222222222222222222222222",
    CRYPTO_USDT_BSC_CONFIRMATIONS: "120",
  };

  const result = await runCryptoPaymentStartupPreflight(
    env,
    {
      info(_message, details) {
        logs.push(details);
      },
      warn(_message, details) {
        logs.push(details);
      },
      error(_message, details) {
        logs.push(details);
      },
    },
    () => ({
      async getAssetDecimals() {
        return 18;
      },
    })
  );

  assert.equal(result?.networks[0].ok, true);
  const serializedLogs = JSON.stringify(logs);
  assert.doesNotMatch(serializedLogs, /secret-rpc/);
  assert.doesNotMatch(
    serializedLogs,
    /2222222222222222222222222222222222222222/
  );
  assert.doesNotMatch(
    serializedLogs,
    /55d398326f99059ff775485246999027b3197955/
  );
});

test("server startup wires the optional read-only preflight before the scheduler", () => {
  const server = fs.readFileSync(path.join(repoRoot, "server.ts"), "utf8");
  const preflightIndex = server.indexOf("runCryptoPaymentStartupPreflight()");
  const schedulerIndex = server.indexOf("startCryptoPaymentScheduler()");

  assert.ok(preflightIndex >= 0);
  assert.ok(schedulerIndex > preflightIndex);
});

test("payment preflight failures redact provider response secrets while preserving categories", async () => {
  const env = {
    CRYPTO_PAYMENTS_ENABLED: "true",
    CRYPTO_USDT_ETHEREUM_ENABLED: "true",
    CRYPTO_USDT_ETHEREUM_RPC_URL: "https://private-provider.test/key-SUPER_SECRET",
    CRYPTO_USDT_ETHEREUM_RECEIVING_ADDRESS: "0x2222222222222222222222222222222222222222",
    CRYPTO_USDT_ETHEREUM_CONFIRMATIONS: "80",
  };
  const result = await preflightConfiguredCryptoPayments(env, () => ({
    async getAssetDecimals() {
      throw new Error("ethereum RPC request failed with HTTP 429. url=https://private-provider.test/key-SUPER_SECRET");
    },
  }));
  assert.equal(result.networks[0].errorCode, "RPC_RATE_LIMITED");
  assert.match(result.networks[0].error ?? "", /rate limiting/i);
  assert.doesNotMatch(JSON.stringify(result), /SUPER_SECRET|private-provider\.test|222222222222/);
});

test("TON cooldown skips only TON, preserves other network scans and resets on success",async()=>{
  const clock={now:Date.parse("2026-10-17T12:00:00Z")};
  const backoff=new TonScanRateLimitBackoff(()=>clock.now);
  const env={
    CRYPTO_PAYMENTS_ENABLED:"true",
    CRYPTO_USDT_BSC_ENABLED:"true",
    CRYPTO_USDT_BSC_RPC_URL:"https://secret-bsc.invalid/key",
    CRYPTO_USDT_BSC_RECEIVING_ADDRESS:"0x2222222222222222222222222222222222222222",
    CRYPTO_USDT_BSC_CONFIRMATIONS:"120",
    CRYPTO_USDT_TON_ENABLED:"true",
    CRYPTO_USDT_TON_RPC_URL:"https://secret-ton.invalid/key",
    CRYPTO_USDT_TON_RECEIVING_ADDRESS:"EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c",
    CRYPTO_USDT_TON_CONFIRMATIONS:"1",
  };
  let failTon=true;
  const called:string[]=[];
  const opts={
    tonBackoff:backoff,
    createWatcher:(config:any)=>({
      runOnce:async()=>{
        called.push(config.id);
        if(config.id==="ton" && failTon)throw new TonCenterRateLimitError(180_000);
        return {network:config.id,nextCursor:"unchanged-fixture",observations:0,
          matched:0,confirming:0,confirmed:0,unmatched:0,ambiguous:0,replayed:0};
      }
    })
  };
  const first=await scanConfiguredCryptoPayments(env,opts);
  assert.deepEqual(called,["bsc","ton"]);
  assert.equal(first.networks[0].ok,true);
  assert.equal(first.networks[1].errorCode,"RPC_RATE_LIMITED");
  assert.equal(first.networks[1].skipped,undefined);
  assert.equal(first.networks[1].error,"Blockchain RPC provider is rate limiting requests.");
  assert.doesNotMatch(JSON.stringify(first),/secret-ton|secret-bsc|222222222222/);

  clock.now+=60_000;
  const second=await scanConfiguredCryptoPayments(env,opts);
  assert.deepEqual(called,["bsc","ton","bsc"]);
  assert.equal(second.networks[0].ok,true);
  assert.equal(second.networks[1].ok,false);
  assert.equal(second.networks[1].skipped,true);
  assert.equal(second.networks[1].retryAt,
    new Date(Date.parse("2026-10-17T12:03:00Z")).toISOString());
  assert.equal(backoff.retryAt(),second.networks[1].retryAt);

  failTon=false;
  clock.now+=120_000;
  const third=await scanConfiguredCryptoPayments(env,opts);
  assert.equal(third.networks[1].ok,true);
  assert.deepEqual(called,["bsc","ton","bsc","bsc","ton"]);
  assert.equal(backoff.retryAt(),null);
});
