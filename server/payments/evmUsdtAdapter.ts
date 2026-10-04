import type {
  CryptoPaymentNetworkConfig,
  CryptoPaymentNetworkAdapter,
  CryptoPaymentScanRequest,
  CryptoPaymentScanResult,
  CryptoPaymentTransferObservation,
} from "./types";

const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ERC20_DECIMALS_SELECTOR = "0x313ce567";

type FetchLike = typeof fetch;

interface JsonRpcResponse<T> {
  jsonrpc?: string;
  id?: number;
  result?: T;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
}

interface EvmLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
  removed?: boolean;
}

interface EvmBlock {
  timestamp: string;
}

function normalizeEvmAddress(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(normalized)) {
    throw new Error(`Invalid EVM ${label} address.`);
  }
  return normalized;
}

function addressToTopic(address: string): string {
  return `0x${address.slice(2).padStart(64, "0")}`;
}

function topicToAddress(topic: string): string {
  const normalized = topic.trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(normalized)) {
    throw new Error("Invalid indexed EVM address topic.");
  }
  return `0x${normalized.slice(-40)}`;
}

function parseHexBigInt(value: string, label: string): bigint {
  if (!/^0x[0-9a-f]+$/i.test(value)) {
    throw new Error(`Invalid EVM ${label} value.`);
  }
  return BigInt(value);
}

function toRpcHex(value: bigint): string {
  if (value < 0n) {
    throw new Error("EVM block number cannot be negative.");
  }
  return `0x${value.toString(16)}`;
}

function parseCursor(value: string): bigint {
  const trimmed = value.trim();
  if (/^0x[0-9a-f]+$/i.test(trimmed)) {
    return BigInt(trimmed);
  }
  if (/^[0-9]+$/.test(trimmed)) {
    return BigInt(trimmed);
  }
  throw new Error("Invalid EVM payment scan cursor.");
}

function formatTokenAmount(rawValue: bigint, decimals: number): string {
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error("Invalid ERC-20 token decimals.");
  }

  if (decimals === 0) {
    return rawValue.toString();
  }

  const digits = rawValue.toString().padStart(decimals + 1, "0");
  const integerPart = digits.slice(0, -decimals);
  const fractionalPart = digits.slice(-decimals).replace(/0+$/, "");

  return fractionalPart ? `${integerPart}.${fractionalPart}` : integerPart;
}

export class EvmUsdtAdapter implements CryptoPaymentNetworkAdapter {
  readonly network: CryptoPaymentNetworkConfig["id"];

  private rpcRequestId = 0;
  private readonly decimalsCache = new Map<string, number>();
  private readonly config: CryptoPaymentNetworkConfig;
  private readonly fetchFn: FetchLike;

  constructor(
    config: CryptoPaymentNetworkConfig,
    fetchFn: FetchLike = fetch
  ) {
    if (config.family !== "evm" || (config.id !== "bsc" && config.id !== "ethereum")) {
      throw new Error("EvmUsdtAdapter requires a BSC or Ethereum EVM configuration.");
    }

    this.config = config;
    this.network = config.id;
    this.fetchFn = fetchFn;
  }

  async scanTransfers(
    request: CryptoPaymentScanRequest
  ): Promise<CryptoPaymentScanResult> {
    const receivingAddress = normalizeEvmAddress(
      request.receivingAddress,
      "receiving"
    );
    const tokenIdentifier = normalizeEvmAddress(
      request.tokenIdentifier,
      "token"
    );

    if (
      receivingAddress !== normalizeEvmAddress(
        this.config.receivingAddress,
        "configured receiving"
      ) ||
      tokenIdentifier !== normalizeEvmAddress(
        this.config.tokenIdentifier,
        "configured token"
      )
    ) {
      throw new Error(
        `EVM scan request does not match configured ${this.network} payment identity.`
      );
    }

    const latestBlock = parseHexBigInt(
      await this.rpc<string>("eth_blockNumber", []),
      "block number"
    );
    const maxBlocks = BigInt(
      Math.min(
        request.maxBlocks ?? this.config.maxBlocksPerScan,
        this.config.maxBlocksPerScan
      )
    );

    if (maxBlocks < 1n) {
      throw new Error("EVM max blocks per scan must be positive.");
    }

    const fromBlock = request.cursor
      ? parseCursor(request.cursor)
      : latestBlock >= maxBlocks - 1n
        ? latestBlock - maxBlocks + 1n
        : 0n;

    if (fromBlock > latestBlock) {
      return {
        observations: [],
        nextCursor: fromBlock.toString(),
        scannedFrom: fromBlock.toString(),
      };
    }

    const requestedTo = fromBlock + maxBlocks - 1n;
    const toBlock = requestedTo < latestBlock ? requestedTo : latestBlock;
    const decimals = await this.getTokenDecimals(tokenIdentifier);
    const logs = await this.rpc<EvmLog[]>("eth_getLogs", [
      {
        fromBlock: toRpcHex(fromBlock),
        toBlock: toRpcHex(toBlock),
        address: tokenIdentifier,
        topics: [
          ERC20_TRANSFER_TOPIC,
          null,
          addressToTopic(receivingAddress),
        ],
      },
    ]);

    const blockTimestampCache = new Map<string, string>();
    const observations: CryptoPaymentTransferObservation[] = [];

    for (const log of logs) {
      if (log.removed) {
        continue;
      }

      if (
        normalizeEvmAddress(log.address, "log token") !== tokenIdentifier ||
        log.topics.length < 3 ||
        log.topics[0]?.toLowerCase() !== ERC20_TRANSFER_TOPIC
      ) {
        continue;
      }

      const toAddress = topicToAddress(log.topics[2]);
      if (toAddress !== receivingAddress) {
        continue;
      }

      const blockNumber = parseHexBigInt(log.blockNumber, "log block number");
      if (blockNumber > latestBlock) {
        continue;
      }

      const confirmationsBigInt = latestBlock - blockNumber + 1n;
      const confirmations =
        confirmationsBigInt > BigInt(Number.MAX_SAFE_INTEGER)
          ? Number.MAX_SAFE_INTEGER
          : Number(confirmationsBigInt);

      let observedAt = blockTimestampCache.get(log.blockNumber);
      if (!observedAt) {
        const block = await this.rpc<EvmBlock | null>("eth_getBlockByNumber", [
          log.blockNumber,
          false,
        ]);
        if (!block?.timestamp) {
          throw new Error(
            `Unable to resolve timestamp for ${this.network} block ${log.blockNumber}.`
          );
        }

        const unixSeconds = parseHexBigInt(block.timestamp, "block timestamp");
        const unixMilliseconds = unixSeconds * 1000n;
        if (unixMilliseconds > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new Error("EVM block timestamp exceeds JavaScript date range.");
        }

        observedAt = new Date(Number(unixMilliseconds)).toISOString();
        blockTimestampCache.set(log.blockNumber, observedAt);
      }

      observations.push({
        network: this.network,
        txHash: log.transactionHash.toLowerCase(),
        eventIndex: parseHexBigInt(log.logIndex, "log index").toString(),
        tokenIdentifier,
        fromAddress: topicToAddress(log.topics[1]),
        toAddress,
        amount: formatTokenAmount(
          parseHexBigInt(log.data, "transfer amount"),
          decimals
        ),
        blockReference: blockNumber.toString(),
        confirmations,
        observedAt,
      });
    }

    const requiredConfirmations = BigInt(this.config.requiredConfirmations);
    const lastSafeBlock =
      latestBlock >= requiredConfirmations - 1n
        ? latestBlock - requiredConfirmations + 1n
        : -1n;

    const nextCursor =
      toBlock <= lastSafeBlock
        ? toBlock + 1n
        : lastSafeBlock + 1n > fromBlock
          ? lastSafeBlock + 1n
          : fromBlock;

    return {
      observations,
      nextCursor: nextCursor.toString(),
      scannedFrom: fromBlock.toString(),
      scannedTo: toBlock.toString(),
    };
  }

  private async getTokenDecimals(tokenIdentifier: string): Promise<number> {
    const cached = this.decimalsCache.get(tokenIdentifier);
    if (cached !== undefined) {
      return cached;
    }

    const encodedDecimals = await this.rpc<string>("eth_call", [
      {
        to: tokenIdentifier,
        data: ERC20_DECIMALS_SELECTOR,
      },
      "latest",
    ]);

    const decimalsBigInt = parseHexBigInt(
      encodedDecimals,
      "token decimals response"
    );
    if (decimalsBigInt > 255n) {
      throw new Error("ERC-20 token decimals response is out of range.");
    }

    const decimals = Number(decimalsBigInt);
    this.decimalsCache.set(tokenIdentifier, decimals);
    return decimals;
  }

  private async rpc<T>(method: string, params: unknown[]): Promise<T> {
    const id = ++this.rpcRequestId;
    const response = await this.fetchFn(this.config.rpcUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `${this.network} RPC request failed with HTTP ${response.status}.`
      );
    }

    const payload = (await response.json()) as JsonRpcResponse<T>;
    if (payload.error) {
      throw new Error(
        `${this.network} RPC ${method} failed: ${payload.error.message ?? "unknown error"}`
      );
    }

    if (payload.result === undefined) {
      throw new Error(
        `${this.network} RPC ${method} returned no result.`
      );
    }

    return payload.result;
  }
}
