import { createCryptoPaymentNetworkAdapter } from "./paymentAdapterFactory";
import { loadCryptoPaymentNetworkConfigs } from "./paymentConfig";
import { CryptoPaymentWatcher } from "./paymentWatcher";
import type {
  CryptoPaymentNetworkConfig,
} from "./types";

export interface CryptoPaymentNetworkRuntimeResult {
  network: CryptoPaymentNetworkConfig["id"];
  ok: boolean;
  result?: Awaited<ReturnType<CryptoPaymentWatcher["runOnce"]>>;
  error?: string;
}

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
      requiredConfirmations: config.requiredConfirmations,
      maxBlocksPerScan: config.maxBlocksPerScan,
    })),
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
