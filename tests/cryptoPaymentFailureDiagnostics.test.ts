import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyCryptoPaymentFailure,
  safeCryptoPaymentFailure,
} from "../server/payments/paymentFailureDiagnostics";

test("scanner errors are classified without copying raw provider messages", () => {
  const cases: Array<[unknown, string]> = [
    [Object.assign(new Error("operation aborted"), { name: "TimeoutError" }), "RPC_TIMEOUT"],
    [new Error("ethereum RPC request failed with HTTP 429"), "RPC_RATE_LIMITED"],
    [new Error("ethereum RPC request failed with HTTP 401"), "RPC_AUTH_REJECTED"],
    [new Error("RPC eth_getLogs failed: query returned more than 10000 results"), "RPC_RANGE_TOO_LARGE"],
    [new Error("RPC reported chain ID 56, expected 1"), "RPC_CHAIN_MISMATCH"],
    [new Error("Configured ethereum USDT token identifier is not a deployed contract"), "RPC_ASSET_INVALID"],
    [new Error("RPC returned no result"), "RPC_INVALID_RESPONSE"],
    [new Error("TON Center request failed with HTTP 502"), "RPC_UPSTREAM_UNAVAILABLE"],
    [Object.assign(new Error("fetch failed"), { code: "ENOTFOUND" }), "RPC_NETWORK_ERROR"],
    [new Error("ethereum RPC eth_getLogs failed: unexpected provider condition"), "RPC_REJECTED"],
    [new Error("secret unknown failure"), "SCAN_FAILED"],
    [null, "SCAN_FAILED"],
  ];
  for (const [error, expectedCode] of cases) {
    const safe = safeCryptoPaymentFailure(error);
    assert.equal(classifyCryptoPaymentFailure(error), expectedCode);
    assert.equal(safe.errorCode, expectedCode);
    assert.ok(safe.error.length > 0);
    assert.doesNotMatch(JSON.stringify(safe), /private-rpc|secret|https:\/\//i);
  }
});

test("unknown errors cannot leak tokens, RPC URLs, or merchant addresses", () => {
  const secret = "https://rpc.example.test/private-rpc?apikey=private-123";
  const message = `Failed at ${secret} wallet 0x2222222222222222222222222222222222222222`;
  const safe = safeCryptoPaymentFailure(new Error(message));
  assert.deepEqual(safe, {
    errorCode: "SCAN_FAILED",
    error: "Blockchain payment scanner encountered an unexpected error.",
  });
  assert.ok(!JSON.stringify(safe).includes(secret));
  assert.ok(!JSON.stringify(safe).includes("2222222222222222222222222222222222222222"));
});
