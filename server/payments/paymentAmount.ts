export const USDT_MATCHING_PRECISION = 6;
export const DEFAULT_PAYMENT_DISCRIMINATOR_DIGITS = 4;
export const MAX_PAYMENT_DISCRIMINATOR_DIGITS = 6;

function assertDecimals(decimals: number): void {
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error("Payment token decimals must be an integer between 0 and 18.");
  }
}

export function parseDecimalToUnits(
  value: string,
  decimals: number
): bigint {
  assertDecimals(decimals);

  const trimmed = value.trim();
  const match = trimmed.match(/^([0-9]+)(?:\.([0-9]+))?$/);
  if (!match) {
    throw new Error("Payment amount must be a positive decimal string.");
  }

  const integerPart = match[1].replace(/^0+(?=\d)/, "");
  const fractionalPart = match[2] ?? "";

  if (integerPart.length > 18) {
    throw new Error("Payment amount exceeds the ledger integer precision.");
  }

  if (fractionalPart.length > decimals) {
    throw new Error(
      `Payment amount has more than ${decimals} supported decimal places.`
    );
  }

  const paddedFraction = fractionalPart.padEnd(decimals, "0");
  const units =
    BigInt(integerPart) * 10n ** BigInt(decimals) +
    BigInt(paddedFraction || "0");

  if (units <= 0n) {
    throw new Error("Payment amount must be greater than zero.");
  }

  return units;
}

export function formatUnits(
  units: bigint,
  decimals: number
): string {
  assertDecimals(decimals);
  if (units < 0n) {
    throw new Error("Payment amount units cannot be negative.");
  }

  if (decimals === 0) {
    return units.toString();
  }

  const digits = units.toString().padStart(decimals + 1, "0");
  const integerPart = digits.slice(0, -decimals);
  const fractionalPart = digits.slice(-decimals).replace(/0+$/, "");

  return fractionalPart
    ? `${integerPart}.${fractionalPart}`
    : integerPart;
}

export function maxPaymentDiscriminatorSlot(
  discriminatorDigits = DEFAULT_PAYMENT_DISCRIMINATOR_DIGITS
): number {
  if (
    !Number.isSafeInteger(discriminatorDigits) ||
    discriminatorDigits < 1 ||
    discriminatorDigits > MAX_PAYMENT_DISCRIMINATOR_DIGITS
  ) {
    throw new Error(
      `Payment discriminator digits must be between 1 and ${MAX_PAYMENT_DISCRIMINATOR_DIGITS}.`
    );
  }

  return 10 ** discriminatorDigits - 1;
}

export function applyPaymentDiscriminator(input: {
  baseAmount: string;
  tokenDecimals: number;
  slot: number;
  discriminatorDigits?: number;
}): string {
  const {
    baseAmount,
    tokenDecimals,
    slot,
    discriminatorDigits = DEFAULT_PAYMENT_DISCRIMINATOR_DIGITS,
  } = input;

  assertDecimals(tokenDecimals);
  if (tokenDecimals < USDT_MATCHING_PRECISION) {
    throw new Error(
      `USDT payment matching requires at least ${USDT_MATCHING_PRECISION} token decimals.`
    );
  }

  const maxSlot = maxPaymentDiscriminatorSlot(discriminatorDigits);
  if (!Number.isSafeInteger(slot) || slot < 1 || slot > maxSlot) {
    throw new Error(
      `Payment discriminator slot must be between 1 and ${maxSlot}.`
    );
  }

  const baseUnits = parseDecimalToUnits(baseAmount, tokenDecimals);
  const discriminatorStep =
    10n ** BigInt(tokenDecimals - USDT_MATCHING_PRECISION);
  const expectedUnits =
    baseUnits + BigInt(slot) * discriminatorStep;

  return formatUnits(expectedUnits, tokenDecimals);
}
