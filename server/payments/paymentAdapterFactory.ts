import { EvmUsdtAdapter } from "./evmUsdtAdapter";
import { TonCenterUsdtAdapter } from "./tonCenterUsdtAdapter";
import type {
  CryptoPaymentNetworkAdapter,
  CryptoPaymentNetworkConfig,
} from "./types";

export function createCryptoPaymentNetworkAdapter(
  config: CryptoPaymentNetworkConfig
): CryptoPaymentNetworkAdapter {
  return config.family === "evm"
    ? new EvmUsdtAdapter(config)
    : new TonCenterUsdtAdapter(config);
}
