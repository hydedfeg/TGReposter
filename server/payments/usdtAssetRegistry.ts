import type { CryptoPaymentNetwork } from "./types";

export interface CanonicalUsdtAsset {
  network: CryptoPaymentNetwork;
  tokenIdentifier: string;
  acceptedIdentifiers: readonly string[];
  provenance: "tether-issued" | "bnb-chain-usdt-representation";
}

export const CANONICAL_USDT_ASSETS: Record<
  CryptoPaymentNetwork,
  CanonicalUsdtAsset
> = {
  ethereum: {
    network: "ethereum",
    tokenIdentifier: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    acceptedIdentifiers: [
      "0xdac17f958d2ee523a2206206994597c13d831ec7",
    ],
    provenance: "tether-issued",
  },
  ton: {
    network: "ton",
    tokenIdentifier:
      "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs",
    acceptedIdentifiers: [
      "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs",
      "0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe",
    ],
    provenance: "tether-issued",
  },
  bsc: {
    network: "bsc",
    tokenIdentifier: "0x55d398326f99059ff775485246999027b3197955",
    acceptedIdentifiers: [
      "0x55d398326f99059ff775485246999027b3197955",
    ],
    provenance: "bnb-chain-usdt-representation",
  },
};

function normalizeIdentifier(
  network: CryptoPaymentNetwork,
  value: string
): string {
  const trimmed = value.trim();
  return network === "ethereum" || network === "bsc"
    ? trimmed.toLowerCase()
    : trimmed;
}

export function resolveCanonicalUsdtTokenIdentifier(
  network: CryptoPaymentNetwork,
  configuredValue?: string
): string {
  const asset = CANONICAL_USDT_ASSETS[network];
  const configured = configuredValue?.trim();

  if (!configured) {
    return asset.tokenIdentifier;
  }

  const normalized = normalizeIdentifier(network, configured);
  const accepted = asset.acceptedIdentifiers.some(
    (candidate) =>
      normalizeIdentifier(network, candidate) === normalized
  );

  if (!accepted) {
    throw new Error(
      `Configured ${network} token identifier is not the allow-listed USDT asset.`
    );
  }

  return asset.tokenIdentifier;
}

export function assertCanonicalUsdtTokenIdentifier(
  network: CryptoPaymentNetwork,
  value: string
): void {
  resolveCanonicalUsdtTokenIdentifier(network, value);
}
