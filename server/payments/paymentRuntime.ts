import { createCryptoPaymentNetworkAdapter } from "./paymentAdapterFactory";
import { safeCryptoPaymentFailure, type CryptoPaymentFailureCode } from "./paymentFailureDiagnostics";
import { TonCenterRateLimitError } from "./tonCenterUsdtAdapter";
import { TonScanRateLimitBackoff } from "./tonScanRateLimitBackoff";
import { CANONICAL_USDT_ASSETS } from "./usdtAssetRegistry";
import {
  loadCryptoPaymentNetworkConfigs,
  loadCryptoPaymentPreflightConfigs,
} from "./paymentConfig";
import { CryptoPaymentWatcher } from "./paymentWatcher";
import type {
  CryptoPaymentNetworkAdapter,
  CryptoPaymentNetworkConfig,
} from "./types";

export interface CryptoPaymentNetworkRuntimeResult {
  network: CryptoPaymentNetworkConfig["id"];
  ok: boolean;
  result?: Awaited<ReturnType<CryptoPaymentWatcher["runOnce"]>>;
  error?: string;
  errorCode?: CryptoPaymentFailureCode;
  /** Provider cooldown is a deliberate skip, not a successful scan. */
  skipped?: boolean;
  retryAt?: string;
}

export interface CryptoPaymentPreflightNetworkResult {
  network: CryptoPaymentNetworkConfig["id"];
  ok: boolean;
  asset: "USDT";
  assetProvenance:
    | "tether-issued"
    | "bnb-chain-usdt-representation";
  assetDecimals?: number;
  error?: string;
  errorCode?: CryptoPaymentFailureCode;
}

export interface CryptoPaymentPreflightResult {
  enabled: boolean;
  networks: CryptoPaymentPreflightNetworkResult[];
}

type PaymentAdapterFactory = (
  config: CryptoPaymentNetworkConfig
) => Pick<CryptoPaymentNetworkAdapter, "getAssetDecimals">;

export interface CryptoPaymentRuntimeResult {
  enabled: boolean;
  networks: CryptoPaymentNetworkRuntimeResult[];
}

export function getCryptoPaymentRuntimeStatus(
  env: Record<string, string | undefined> = process.env
) {
  const configs = loadCryptoPaymentNetworkConfigs(env);
  return {
    enabled: configs.length > 0,
    networks: configs.map((config) => ({
      id: config.id,
      family: config.family,
      asset: config.asset,
      assetProvenance: CANONICAL_USDT_ASSETS[config.id].provenance,
      requiredConfirmations: config.requiredConfirmations,
      maxBlocksPerScan: config.maxBlocksPerScan,
    })),
  };
}

export async function preflightConfiguredCryptoPayments(
  env: Record<string, string | undefined> = process.env,
  createAdapter: PaymentAdapterFactory = createCryptoPaymentNetworkAdapter
): Promise<CryptoPaymentPreflightResult> {
  const configs = loadCryptoPaymentPreflightConfigs(env);
  if (configs.length === 0) {
    return {
      enabled: false,
      networks: [],
    };
  }

  const networks: CryptoPaymentPreflightNetworkResult[] = [];

  for (const config of configs) {
    try {
      const adapter = createAdapter(config);
      const assetDecimals = await adapter.getAssetDecimals();

      networks.push({
        network: config.id,
        ok: true,
        asset: "USDT",
        assetProvenance:
          CANONICAL_USDT_ASSETS[config.id].provenance,
        assetDecimals,
      });
    } catch (error: any) {
      networks.push({
        network: config.id,
        ok: false,
        asset: "USDT",
        assetProvenance:
          CANONICAL_USDT_ASSETS[config.id].provenance,
        ...safeCryptoPaymentFailure(error),
      });
    }
  }

  return {
    enabled: true,
    networks,
  };
}

interface CryptoPaymentPreflightLogger {
  info(message: string, details?: unknown): void;
  warn(message: string, details?: unknown): void;
  error(message: string, details?: unknown): void;
}

export async function runCryptoPaymentStartupPreflight(
  env: Record<string, string | undefined> = process.env,
  logger: CryptoPaymentPreflightLogger = console,
  createAdapter: PaymentAdapterFactory = createCryptoPaymentNetworkAdapter
): Promise<CryptoPaymentPreflightResult | null> {
  if (
    env.CRYPTO_PAYMENT_PREFLIGHT_ON_STARTUP?.trim().toLowerCase() !==
    "true"
  ) {
    return null;
  }

  try {
    const result = await preflightConfiguredCryptoPayments(
      env,
      createAdapter
    );

    if (!result.enabled || result.networks.length === 0) {
      logger.warn("Crypto payment startup preflight found no configured networks.");
      return result;
    }

    const failed = result.networks.filter((network) => !network.ok);
    const summary = result.networks.map((network) => ({
      network: network.network,
      ok: network.ok,
      asset: network.asset,
      assetProvenance: network.assetProvenance,
      assetDecimals: network.assetDecimals,
      error: network.error,
    }));

    if (failed.length > 0) {
      logger.warn("Crypto payment startup preflight completed with failures.", {
        networks: summary,
      });
    } else {
      logger.info("Crypto payment startup preflight passed.", {
        networks: summary,
      });
    }

    return result;
  } catch (error: any) {
    logger.error("Crypto payment startup preflight failed.", {
      code: safeCryptoPaymentFailure(error).errorCode,
    });
    return null;
  }
}

const sharedTonScanBackoff = new TonScanRateLimitBackoff();

export interface CryptoPaymentScanOptions {
  /** Deterministic test injection only; never supplied by a browser. */
  tonBackoff?: TonScanRateLimitBackoff;
  createWatcher?: (
    config: CryptoPaymentNetworkConfig
  ) => Pick<CryptoPaymentWatcher, "runOnce">;
}

export async function scanConfiguredCryptoPayments(
  env: Record<string, string | undefined> = process.env,
  options: CryptoPaymentScanOptions = {}
): Promise<CryptoPaymentRuntimeResult> {
  const configs = loadCryptoPaymentNetworkConfigs(env);
  if (configs.length === 0) {
    return {
      enabled: false,
      networks: [],
    };
  }

  const networks: CryptoPaymentNetworkRuntimeResult[] = [];
  const backoff = options.tonBackoff ?? sharedTonScanBackoff;
  const createWatcher = options.createWatcher ??
    ((config: CryptoPaymentNetworkConfig) =>
      new CryptoPaymentWatcher(config, createCryptoPaymentNetworkAdapter(config)));

  for (const config of configs) {
    if (config.id === "ton") {
      const retryAt = backoff.retryAt();
      if (retryAt) {
        networks.push({
          network: config.id,
          ok: false,
          skipped: true,
          errorCode: "RPC_RATE_LIMITED",
          error: "Blockchain RPC provider is rate limiting requests.",
          retryAt,
        });
        continue;
      }
    }
    try {
      const result = await createWatcher(config).runOnce();
      if (config.id === "ton") backoff.reset();
      networks.push({
        network: config.id,
        ok: true,
        result,
      });
    } catch (error: unknown) {
      const failure = safeCryptoPaymentFailure(error);
      if (config.id === "ton") {
        if (failure.errorCode === "RPC_RATE_LIMITED") {
          backoff.noteRateLimited(
            error instanceof TonCenterRateLimitError ? error.retryAfterMs : null
          );
        } else {
          backoff.reset();
        }
      }
      networks.push({
        network: config.id,
        ok: false,
        ...failure,
      });
    }
  }

  return {
    enabled: true,
    networks,
  };
}
