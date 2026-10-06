import {
  type CryptoPaymentNetwork,
  type CryptoPaymentNetworkConfig,
} from "./types";
import { resolveCanonicalUsdtTokenIdentifier } from "./usdtAssetRegistry";

type Environment = Record<string, string | undefined>;

interface NetworkEnvironmentDefinition {
  id: CryptoPaymentNetwork;
  family: "evm" | "ton";
  prefix: string;
}

const NETWORK_DEFINITIONS: NetworkEnvironmentDefinition[] = [
  { id: "bsc", family: "evm", prefix: "CRYPTO_USDT_BSC" },
  { id: "ethereum", family: "evm", prefix: "CRYPTO_USDT_ETHEREUM" },
  { id: "ton", family: "ton", prefix: "CRYPTO_USDT_TON" },
];

function isEnabled(value?: string): boolean {
  return value?.trim().toLowerCase() === "true";
}

function requiredValue(
  env: Environment,
  key: string,
  network: CryptoPaymentNetwork
): string {
  const value = env[key]?.trim() ?? "";
  if (!value) {
    throw new Error(
      `Crypto payment network "${network}" is enabled but ${key} is missing.`
    );
  }
  return value;
}

function parsePositiveInteger(
  value: string | undefined,
  network: CryptoPaymentNetwork,
  label: string,
  fallback?: number
): number {
  const configured = value?.trim();
  const raw =
    configured ||
    (fallback !== undefined ? String(fallback) : "");

  if (!raw) {
    throw new Error(
      `Crypto payment network "${network}" requires explicit ${label}.`
    );
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(
      `Crypto payment network "${network}" has invalid ${label}.`
    );
  }

  return parsed;
}

export function loadCryptoPaymentNetworkConfigs(
  env: Environment = process.env
): CryptoPaymentNetworkConfig[] {
  if (!isEnabled(env.CRYPTO_PAYMENTS_ENABLED)) {
    return [];
  }

  return NETWORK_DEFINITIONS.flatMap((definition) => {
    const enabledKey = `${definition.prefix}_ENABLED`;
    if (!isEnabled(env[enabledKey])) {
      return [];
    }

    const requiredConfirmations = parsePositiveInteger(
      env[`${definition.prefix}_CONFIRMATIONS`],
      definition.id,
      "required confirmations",
      definition.family === "ton" ? 1 : undefined
    );

    if (definition.family === "ton" && requiredConfirmations !== 1) {
      throw new Error(
        'Crypto payment network "ton" requires CRYPTO_USDT_TON_CONFIRMATIONS=1 when using indexed finalized transfers.'
      );
    }

    return [
      {
        id: definition.id,
        family: definition.family,
        asset: "USDT" as const,
        enabled: true,
        rpcUrl: requiredValue(
          env,
          `${definition.prefix}_RPC_URL`,
          definition.id
        ),
        ...(definition.family === "ton" && env.CRYPTO_USDT_TON_API_KEY?.trim()
          ? { apiKey: env.CRYPTO_USDT_TON_API_KEY.trim() }
          : {}),
        receivingAddress: requiredValue(
          env,
          `${definition.prefix}_RECEIVING_ADDRESS`,
          definition.id
        ),
        tokenIdentifier: resolveCanonicalUsdtTokenIdentifier(
          definition.id,
          env[`${definition.prefix}_TOKEN_IDENTIFIER`]
        ),
        requiredConfirmations,
        maxBlocksPerScan: parsePositiveInteger(
          env[`${definition.prefix}_MAX_BLOCKS_PER_SCAN`],
          definition.id,
          "max blocks per scan",
          1000
        ),
        requestTimeoutMs: parsePositiveInteger(
          env.CRYPTO_PAYMENT_REQUEST_TIMEOUT_MS,
          definition.id,
          "request timeout",
          10_000
        ),
      },
    ];
  });
}
