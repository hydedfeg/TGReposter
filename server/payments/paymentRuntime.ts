import { createCryptoPaymentNetworkAdapter } from "./paymentAdapterFactory";
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
        error:
          typeof error?.message === "string"
            ? error.message
            : "Crypto payment network preflight failed.",
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
      name: error?.name,
      message:
        typeof error?.message === "string"
          ? error.message
          : "Unknown crypto payment preflight error.",
    });
    return null;
  }
}

export async function scanConfiguredCryptoPayments(
  env: Record<string, string | undefined> = process.env
): Promise<CryptoPaymentRuntimeResult> {
  const configs = loadCryptoPaymentNetworkConfigs(env);
  if (configs.length === 0) {
    return {
      enabled: false,
      networks: [],
    };
  }

  const networks: CryptoPaymentNetworkRuntimeResult[] = [];

  for (const config of configs) {
    try {
      const adapter = createCryptoPaymentNetworkAdapter(config);
      const watcher = new CryptoPaymentWatcher(config, adapter);
      const result = await watcher.runOnce();
      networks.push({
        network: config.id,
        ok: true,
        result,
      });
    } catch (error: any) {
      networks.push({
        network: config.id,
        ok: false,
        error:
          typeof error?.message === "string"
            ? error.message
            : "Crypto payment scan failed.",
      });
    }
  }

  return {
    enabled: true,
    networks,
  };
}
