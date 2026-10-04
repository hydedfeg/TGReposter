import {
  type CryptoPaymentNetwork,
  type CryptoPaymentNetworkConfig,
} from "./types";

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
  fallback: number
): number {
  const raw = value?.trim() || String(fallback);
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
        receivingAddress: requiredValue(
          env,
          `${definition.prefix}_RECEIVING_ADDRESS`,
          definition.id
        ),
        tokenIdentifier: requiredValue(
          env,
          `${definition.prefix}_TOKEN_IDENTIFIER`,
          definition.id
        ),
        requiredConfirmations: parsePositiveInteger(
          env[`${definition.prefix}_CONFIRMATIONS`],
          definition.id,
          "required confirmations",
          1
        ),
        maxBlocksPerScan: parsePositiveInteger(
          env[`${definition.prefix}_MAX_BLOCKS_PER_SCAN`],
          definition.id,
          "max blocks per scan",
          1000
        ),
      },
    ];
  });
}
