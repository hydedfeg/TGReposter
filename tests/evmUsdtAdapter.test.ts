import test from "node:test";
import assert from "node:assert/strict";
import { EvmUsdtAdapter } from "../server/payments/evmUsdtAdapter";
import type { CryptoPaymentNetworkConfig } from "../server/payments/types";

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const token = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const merchant = "0x2222222222222222222222222222222222222222";
const sender = "0x1111111111111111111111111111111111111111";

function topic(address: string): string {
  return `0x${address.slice(2).padStart(64, "0")}`;
}

function config(): CryptoPaymentNetworkConfig {
  return {
    id: "bsc",
    family: "evm",
    asset: "USDT",
    enabled: true,
    rpcUrl: "https://rpc.example.test",
    receivingAddress: merchant,
    tokenIdentifier: token,
    requiredConfirmations: 4,
    maxBlocksPerScan: 10,
  };
}

test("EVM watcher decodes USDT Transfer logs and preserves confirmation overlap", async () => {
  const calls: Array<{ method: string; params: unknown[] }> = [];
  const fetchMock: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      id: number;
      method: string;
      params: unknown[];
    };
    calls.push({ method: body.method, params: body.params });

    let result: unknown;
    switch (body.method) {
      case "eth_chainId":
        result = "0x38";
        break;
      case "eth_blockNumber":
        result = "0x64";
        break;
      case "eth_getCode":
        result = "0x60016000";
        break;
      case "eth_call":
        result = "0x6";
        break;
      case "eth_getLogs":
        result = [
          {
            address: token,
            topics: [TRANSFER_TOPIC, topic(sender), topic(merchant)],
            data: "0xbc614e",
            blockNumber: "0x63",
            transactionHash:
              "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            logIndex: "0x2",
            removed: false,
          },
        ];
        break;
      case "eth_getBlockByNumber":
        result = {
          timestamp: "0x65000000",
        };
        break;
      default:
        throw new Error(`Unexpected RPC method ${body.method}`);
    }

    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id: body.id, result }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  };

  const adapter = new EvmUsdtAdapter(config(), fetchMock);
  const scan = await adapter.scanTransfers({
    receivingAddress: merchant.toUpperCase().replace("0X", "0x"),
    tokenIdentifier: token,
    cursor: "95",
    maxBlocks: 10,
  });

  assert.equal(scan.scannedFrom, "95");
  assert.equal(scan.scannedTo, "100");
  assert.equal(scan.nextCursor, "98");
  assert.equal(scan.observations.length, 1);

  const observation = scan.observations[0];
  assert.equal(observation.network, "bsc");
  assert.equal(observation.amount, "12.345678");
  assert.equal(observation.confirmations, 2);
  assert.equal(observation.eventIndex, "2");
  assert.equal(observation.fromAddress, sender);
  assert.equal(observation.toAddress, merchant);
  assert.equal(observation.tokenIdentifier, token);
  assert.equal(observation.blockReference, "99");
  assert.match(observation.observedAt, /^2023-/);

  const logsCall = calls.find((call) => call.method === "eth_getLogs");
  assert.ok(logsCall);
  const filter = logsCall.params[0] as {
    fromBlock: string;
    toBlock: string;
    address: string;
    topics: Array<string | null>;
  };
  assert.equal(filter.fromBlock, "0x5f");
  assert.equal(filter.toBlock, "0x64");
  assert.equal(filter.address, token);
  assert.equal(filter.topics[0], TRANSFER_TOPIC);
  assert.equal(filter.topics[2], topic(merchant));
});

test("EVM watcher caches ERC-20 decimals between scans", async () => {
  let decimalsCalls = 0;
  const fetchMock: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      id: number;
      method: string;
    };

    let result: unknown;
    if (body.method === "eth_chainId") {
      result = "0x38";
    } else if (body.method === "eth_blockNumber") {
      result = "0xa";
    } else if (body.method === "eth_getCode") {
      result = "0x60016000";
    } else if (body.method === "eth_call") {
      decimalsCalls += 1;
      result = "0x6";
    } else if (body.method === "eth_getLogs") {
      result = [];
    } else {
      throw new Error(`Unexpected RPC method ${body.method}`);
    }

    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id: body.id, result }),
      { status: 200 }
    );
  };

  const adapter = new EvmUsdtAdapter(config(), fetchMock);
  await adapter.scanTransfers({
    receivingAddress: merchant,
    tokenIdentifier: token,
    cursor: "10",
  });
  await adapter.scanTransfers({
    receivingAddress: merchant,
    tokenIdentifier: token,
    cursor: "10",
  });

  assert.equal(decimalsCalls, 1);
});

test("EVM watcher rejects a scan for a different token or merchant wallet", async () => {
  const adapter = new EvmUsdtAdapter(
    config(),
    async () => {
      throw new Error("RPC should not be called");
    }
  );

  await assert.rejects(
    () =>
      adapter.scanTransfers({
        receivingAddress: "0x3333333333333333333333333333333333333333",
        tokenIdentifier: token,
      }),
    /does not match configured/
  );
});

test("EVM watcher rejects an RPC endpoint for the wrong chain", async () => {
  const fetchMock: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      id: number;
      method: string;
    };

    if (body.method !== "eth_chainId") {
      throw new Error("No payment data should be queried on the wrong chain.");
    }

    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        result: "0x1",
      }),
      { status: 200 }
    );
  };

  const adapter = new EvmUsdtAdapter(config(), fetchMock);

  await assert.rejects(
    () =>
      adapter.scanTransfers({
        receivingAddress: merchant,
        tokenIdentifier: token,
        cursor: "1",
      }),
    /reported chain ID 1, expected 56/
  );
});

test("EVM watcher rejects a token identifier with no deployed contract", async () => {
  const fetchMock: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      id: number;
      method: string;
    };

    const result =
      body.method === "eth_chainId"
        ? "0x38"
        : body.method === "eth_blockNumber"
          ? "0xa"
          : body.method === "eth_getCode"
            ? "0x"
            : null;

    if (result === null) {
      throw new Error(`Unexpected RPC method ${body.method}`);
    }

    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        result,
      }),
      { status: 200 }
    );
  };

  const adapter = new EvmUsdtAdapter(config(), fetchMock);

  await assert.rejects(
    () =>
      adapter.scanTransfers({
        receivingAddress: merchant,
        tokenIdentifier: token,
        cursor: "1",
      }),
    /not a deployed contract/
  );
});
