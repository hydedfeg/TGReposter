import { createCryptoPaymentNetworkAdapter } from "./paymentAdapterFactory";
import { CANONICAL_USDT_ASSETS } from "./usdtAssetRegistry";
import { loadCryptoPaymentNetworkConfigs } from "./paymentConfig";
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
  const configs = loadCryptoPaymentNetworkConfigs(env);
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
