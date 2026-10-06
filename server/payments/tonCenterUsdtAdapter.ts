import type {
  CryptoPaymentNetworkAdapter,
  CryptoPaymentNetworkConfig,
  CryptoPaymentScanRequest,
  CryptoPaymentScanResult,
  CryptoPaymentTransferObservation,
} from "./types";
import { assertCanonicalUsdtTokenIdentifier } from "./usdtAssetRegistry";

type FetchLike = typeof fetch;

interface TonJettonMaster {
  address?: string;
  jetton_content?: Record<string, unknown>;
}

interface TonJettonMastersResponse {
  jetton_masters?: TonJettonMaster[];
}

interface TonJettonTransfer {
  amount?: string;
  destination?: string;
  jetton_master?: string;
  query_id?: string;
  source?: string;
  source_wallet?: string;
  transaction_aborted?: boolean;
  transaction_hash?: string;
  transaction_lt?: string;
  transaction_now?: number;
}

interface TonJettonTransfersResponse {
  jetton_transfers?: TonJettonTransfer[];
}

const TON_BOOTSTRAP_LOOKBACK_SECONDS = 60 * 60;
const TON_CURSOR_OVERLAP_SECONDS = 30;
const TON_MAX_TRANSFER_BATCH = 1000;

function parsePositiveInteger(value: unknown, label: string): number {
  const raw =
    typeof value === "number"
      ? String(value)
      : typeof value === "string"
        ? value.trim()
        : "";

  if (!/^[0-9]+$/.test(raw)) {
    throw new Error(`Invalid TON ${label}.`);
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid TON ${label}.`);
  }

  return parsed;
}

function parseCursor(value: string): number {
  return parsePositiveInteger(value, "payment scan cursor");
}

function formatBaseUnits(raw: string, decimals: number): string {
  if (!/^[0-9]+$/.test(raw)) {
    throw new Error("Invalid TON Jetton transfer amount.");
  }
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error("Invalid TON Jetton decimals.");
  }

  const value = BigInt(raw);
  if (decimals === 0) {
    return value.toString();
  }

  const digits = value.toString().padStart(decimals + 1, "0");
  const integerPart = digits.slice(0, -decimals);
  const fractionalPart = digits.slice(-decimals).replace(/0+$/, "");
  return fractionalPart ? `${integerPart}.${fractionalPart}` : integerPart;
}

function cleanRequiredValue(value: string, label: string): string {
  const cleaned = value.trim();
  if (!cleaned) {
    throw new Error(`TON ${label} is required.`);
  }
  return cleaned;
}

function baseApiUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed.replace(/\/api\/v3$/i, "");
}

export class TonCenterUsdtAdapter implements CryptoPaymentNetworkAdapter {
  readonly network = "ton" as const;

  private decimals: number | null = null;

  constructor(
    private readonly config: CryptoPaymentNetworkConfig,
    private readonly fetchFn: FetchLike = fetch,
    private readonly now: () => number = () => Date.now()
  ) {
    if (config.id !== "ton" || config.family !== "ton") {
      throw new Error("TonCenterUsdtAdapter requires a TON configuration.");
    }

    assertCanonicalUsdtTokenIdentifier("ton", config.tokenIdentifier);
  }

  async getAssetDecimals(): Promise<number> {
    return this.getJettonDecimals(
      cleanRequiredValue(this.config.tokenIdentifier, "Jetton master")
    );
  }

  async scanTransfers(
    request: CryptoPaymentScanRequest
  ): Promise<CryptoPaymentScanResult> {
    const receivingAddress = cleanRequiredValue(
      request.receivingAddress,
      "receiving address"
    );
    const tokenIdentifier = cleanRequiredValue(
      request.tokenIdentifier,
      "Jetton master"
    );

    if (
      receivingAddress !== this.config.receivingAddress.trim() ||
      tokenIdentifier !== this.config.tokenIdentifier.trim()
    ) {
      throw new Error(
        "TON scan request does not match configured payment identity."
      );
    }

    const nowSeconds = Math.floor(this.now() / 1000);
    const startUtime = request.cursor
      ? parseCursor(request.cursor)
      : Math.max(0, nowSeconds - TON_BOOTSTRAP_LOOKBACK_SECONDS);

    const requestedLimit = request.maxBlocks ?? this.config.maxBlocksPerScan;
    if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1) {
      throw new Error("TON transfer scan limit must be positive.");
    }
    const limit = Math.min(
      requestedLimit,
      this.config.maxBlocksPerScan,
      TON_MAX_TRANSFER_BATCH
    );

    const decimals = await this.getAssetDecimals();
    const response = await this.getJson<TonJettonTransfersResponse>(
      "/api/v3/jetton/transfers",
      {
        owner_address: receivingAddress,
        jetton_master: tokenIdentifier,
        direction: "in",
        start_utime: String(startUtime),
        limit: String(limit),
        sort: "asc",
      }
    );

    const transfers = [...(response.jetton_transfers ?? [])].sort((a, b) => {
      const timeA = a.transaction_now ?? 0;
      const timeB = b.transaction_now ?? 0;
      if (timeA !== timeB) {
        return timeA - timeB;
      }

      const ltA = BigInt(a.transaction_lt ?? "0");
      const ltB = BigInt(b.transaction_lt ?? "0");
      return ltA < ltB ? -1 : ltA > ltB ? 1 : 0;
    });

    const observations: CryptoPaymentTransferObservation[] = [];
    let newestObservedAt = startUtime;

    for (const transfer of transfers) {
      if (transfer.transaction_aborted !== false) {
        continue;
      }

      const transactionHash = transfer.transaction_hash?.trim();
      const transactionLt = transfer.transaction_lt?.trim();
      const transactionNow = transfer.transaction_now;

      if (
        !transactionHash ||
        !transactionLt ||
        !/^[0-9]+$/.test(transactionLt) ||
        !Number.isSafeInteger(transactionNow) ||
        (transactionNow ?? -1) < 0 ||
        !transfer.amount
      ) {
        continue;
      }

      newestObservedAt = Math.max(newestObservedAt, transactionNow!);

      const eventIndex = [
        transactionLt,
        transfer.query_id?.trim() || "0",
        transfer.source_wallet?.trim() || transfer.source?.trim() || "unknown",
        transfer.destination?.trim() || receivingAddress,
        transfer.amount,
      ].join(":");

      observations.push({
        network: "ton",
        txHash: transactionHash,
        eventIndex,
        tokenIdentifier,
        fromAddress:
          transfer.source?.trim() ||
          transfer.source_wallet?.trim() ||
          undefined,
        toAddress: receivingAddress,
        amount: formatBaseUnits(transfer.amount, decimals),
        blockReference: transactionLt,
        confirmations: 1,
        observedAt: new Date(transactionNow! * 1000).toISOString(),
      });
    }

    const recoveryAnchor =
      observations.length > 0
        ? newestObservedAt
        : Math.max(startUtime, nowSeconds);
    const nextCursor = Math.max(
      startUtime,
      recoveryAnchor - TON_CURSOR_OVERLAP_SECONDS
    );

    return {
      observations,
      nextCursor: String(nextCursor),
      scannedFrom: String(startUtime),
      scannedTo: String(nowSeconds),
    };
  }

  private async getJettonDecimals(tokenIdentifier: string): Promise<number> {
    if (this.decimals !== null) {
      return this.decimals;
    }

    const response = await this.getJson<TonJettonMastersResponse>(
      "/api/v3/jetton/masters",
      {
        address: tokenIdentifier,
        limit: "1",
      }
    );

    const master = response.jetton_masters?.[0];
    const rawDecimals = master?.jetton_content?.decimals;
    const decimals = parsePositiveInteger(rawDecimals, "Jetton decimals");

    if (decimals > 18) {
      throw new Error(
        "Configured TON Jetton precision exceeds the payment ledger limit of 18 decimals."
      );
    }

    this.decimals = decimals;
    return decimals;
  }

  private async getJson<T>(
    path: string,
    params: Record<string, string>
  ): Promise<T> {
    const url = new URL(
      `${baseApiUrl(this.config.rpcUrl)}${path}`
    );

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const headers: Record<string, string> = {
      accept: "application/json",
    };
    if (this.config.apiKey) {
      headers["X-Api-Key"] = this.config.apiKey;
    }

    const response = await this.fetchFn(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(this.config.requestTimeoutMs),
    });

    if (!response.ok) {
      throw new Error(
        `TON Center request failed with HTTP ${response.status}.`
      );
    }

    return (await response.json()) as T;
  }
}
