import { loadCryptoPaymentNetworkConfigs } from "./paymentConfig";
import { parseCryptoPaymentScanIntervalMs } from "./paymentScheduler";
import { CRYPTO_PAYMENT_NETWORKS, type CryptoPaymentNetwork } from "./types";

type Environment = Record<string, string | undefined>;

export type CryptoPaymentScanState = "disabled" | "never_scanned" | "recent" | "stale";

export interface CryptoPaymentStateRow {
  network: CryptoPaymentNetwork;
  receiving_address: string;
  token_identifier: string;
  last_scanned_at: string | Date | null;
}

export interface CryptoPaymentNetworkHealth {
  network: CryptoPaymentNetwork;
  state: CryptoPaymentScanState;
  lastScannedAt: string | null;
  ageSeconds: number | null;
}

function matchesConfig(
  row: CryptoPaymentStateRow,
  config: { id: CryptoPaymentNetwork; receivingAddress: string; tokenIdentifier: string }
): boolean {
  if (row.network !== config.id) return false;
  if (config.id === "ton") {
    return row.receiving_address === config.receivingAddress &&
      row.token_identifier === config.tokenIdentifier;
  }
  return row.receiving_address.toLowerCase() === config.receivingAddress.toLowerCase() &&
    row.token_identifier.toLowerCase() === config.tokenIdentifier.toLowerCase();
}

/**
 * Health reflects the age of the last successful scanner checkpoint, not chain
 * finality or proof that an individual payment has been settled.
 * Only checkpoints for the CURRENT network/token/merchant identity count.
 */
export function assessCryptoPaymentNetworkHealth(
  rows: CryptoPaymentStateRow[],
  env: Environment = process.env,
  now: Date = new Date()
): { checkedAt: string; staleAfterSeconds: number; networks: CryptoPaymentNetworkHealth[] } {
  const configs = loadCryptoPaymentNetworkConfigs(env);
  const intervalMs = parseCryptoPaymentScanIntervalMs(env.CRYPTO_PAYMENT_SCAN_INTERVAL_MS);
  const staleAfterMs = Math.max(3 * intervalMs, 180_000);
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) throw new Error("Invalid network health evaluation timestamp.");

  return {
    checkedAt: now.toISOString(),
    staleAfterSeconds: Math.ceil(staleAfterMs / 1000),
    networks: CRYPTO_PAYMENT_NETWORKS.map((network) => {
      const config = configs.find((item) => item.id === network);
      if (!config) {
        return { network, state: "disabled" as const, lastScannedAt: null, ageSeconds: null };
      }

      const latest = rows
        .filter((row) => matchesConfig(row, config))
        .map((row) => {
          const value = row.last_scanned_at;
          const timestamp = value instanceof Date ? value.getTime() : Date.parse(value || "");
          return timestamp;
        })
        .filter(Number.isFinite)
        .sort((a, b) => b - a)[0];

      if (latest === undefined) {
        return { network, state: "never_scanned" as const, lastScannedAt: null, ageSeconds: null };
      }

      const elapsedMs = nowMs - latest;
      // Clock drift greater than one minute is also suspect.
      const recent = elapsedMs >= -60_000 && elapsedMs <= staleAfterMs;
      return {
        network,
        state: recent ? "recent" as const : "stale" as const,
        lastScannedAt: new Date(latest).toISOString(),
        ageSeconds: Math.max(0, Math.floor(elapsedMs / 1000)),
      };
    }),
  };
}
