import test from "node:test";
import assert from "node:assert/strict";
import { TonCenterUsdtAdapter } from "../server/payments/tonCenterUsdtAdapter";
import type { CryptoPaymentNetworkConfig } from "../server/payments/types";

const merchant = "EQMerchantWalletAddress";
const master = "EQUsdtJettonMaster";

function config(): CryptoPaymentNetworkConfig {
  return {
    id: "ton",
    family: "ton",
    asset: "USDT",
    enabled: true,
    rpcUrl: "https://toncenter.example.test/api/v3",
    apiKey: "server-only-key",
    receivingAddress: merchant,
    tokenIdentifier: master,
    requiredConfirmations: 1,
    maxBlocksPerScan: 100,
  };
}

test("TON watcher reads Jetton decimals and filters incoming non-aborted transfers", async () => {
  const urls: URL[] = [];
  const headersSeen: Array<HeadersInit | undefined> = [];
  let masterCalls = 0;

  const fetchMock: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    urls.push(url);
    headersSeen.push(init?.headers);

    let payload: unknown;
    if (url.pathname === "/api/v3/jetton/masters") {
      masterCalls += 1;
      payload = {
        jetton_masters: [
          {
            address: master,
            jetton_content: {
              symbol: "USD₮",
              decimals: "6",
            },
          },
        ],
      };
    } else if (url.pathname === "/api/v3/jetton/transfers") {
      payload = {
        jetton_transfers: [
          {
            amount: "25000000",
            destination: "0:canonical-destination",
            jetton_master: "0:canonical-master",
            query_id: "7",
            source: "EQSender",
            source_wallet: "EQSenderJettonWallet",
            transaction_aborted: false,
            transaction_hash: "base64-transaction-hash",
            transaction_lt: "12345",
            transaction_now: 1699999900,
          },
          {
            amount: "99000000",
            transaction_aborted: true,
            transaction_hash: "aborted-hash",
            transaction_lt: "12346",
            transaction_now: 1699999910,
          },
        ],
      };
    } else {
      throw new Error(`Unexpected TON API path ${url.pathname}`);
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const adapter = new TonCenterUsdtAdapter(
    config(),
    fetchMock,
    () => 1_700_000_000_000
  );

  const scan = await adapter.scanTransfers({
    receivingAddress: merchant,
    tokenIdentifier: master,
  });

  assert.equal(scan.scannedFrom, "1699996400");
  assert.equal(scan.scannedTo, "1700000000");
  assert.equal(scan.nextCursor, "1699999870");
  assert.equal(scan.observations.length, 1);

  const transfer = scan.observations[0];
  assert.equal(transfer.network, "ton");
  assert.equal(transfer.amount, "25");
  assert.equal(transfer.confirmations, 1);
  assert.equal(transfer.txHash, "base64-transaction-hash");
  assert.equal(transfer.blockReference, "12345");
  assert.equal(transfer.fromAddress, "EQSender");
  assert.equal(transfer.toAddress, merchant);
  assert.equal(transfer.tokenIdentifier, master);

  const transferRequest = urls.find(
    (url) => url.pathname === "/api/v3/jetton/transfers"
  );
  assert.ok(transferRequest);
  assert.equal(transferRequest.searchParams.get("owner_address"), merchant);
  assert.equal(transferRequest.searchParams.get("jetton_master"), master);
  assert.equal(transferRequest.searchParams.get("direction"), "in");
  assert.equal(transferRequest.searchParams.get("sort"), "asc");
  assert.equal(transferRequest.searchParams.get("limit"), "100");

  const firstHeaders = new Headers(headersSeen[0]);
  assert.equal(firstHeaders.get("X-Api-Key"), "server-only-key");

  await adapter.scanTransfers({
    receivingAddress: merchant,
    tokenIdentifier: master,
    cursor: scan.nextCursor,
  });
  assert.equal(masterCalls, 1);
});

test("TON watcher rejects mismatched payment identity before API access", async () => {
  const adapter = new TonCenterUsdtAdapter(
    config(),
    async () => {
      throw new Error("TON API must not be called");
    }
  );

  await assert.rejects(
    () =>
      adapter.scanTransfers({
        receivingAddress: "EQDifferentWallet",
        tokenIdentifier: master,
      }),
    /does not match configured payment identity/
  );
});
