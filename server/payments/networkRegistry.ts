import {
  type CryptoPaymentNetwork,
  type CryptoPaymentNetworkAdapter,
} from "./types";

export class CryptoPaymentNetworkRegistry {
  private readonly adapters = new Map<
    CryptoPaymentNetwork,
    CryptoPaymentNetworkAdapter
  >();

  register(adapter: CryptoPaymentNetworkAdapter): void {
    if (this.adapters.has(adapter.network)) {
      throw new Error(
        `Crypto payment adapter for "${adapter.network}" is already registered.`
      );
    }

    this.adapters.set(adapter.network, adapter);
  }

  get(network: CryptoPaymentNetwork): CryptoPaymentNetworkAdapter {
    const adapter = this.adapters.get(network);
    if (!adapter) {
      throw new Error(
        `Crypto payment adapter for "${network}" is not registered.`
      );
    }

    return adapter;
  }

  has(network: CryptoPaymentNetwork): boolean {
    return this.adapters.has(network);
  }

  list(): CryptoPaymentNetwork[] {
    return [...this.adapters.keys()];
  }
}
