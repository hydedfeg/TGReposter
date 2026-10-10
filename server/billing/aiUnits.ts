/**
 * Commercial AI Unit math. Values are decimal strings to avoid floating point
 * drift in finance-like accounting. Pricing v1: USD $1 = 100 TG AI Units.
 *
 * OpenRouter usage.cost is the billed account cost; upstream_inference_cost
 * is informational only and must NOT replace usage.cost for customer billing.
 */
export const AI_UNITS_PER_USD = 100;

function scaledDecimal(value: unknown, scale: number): bigint {
  if ((typeof value !== "string" && typeof value !== "number")
    || (typeof value === "number" && !Number.isFinite(value))) {
    throw new Error("Invalid OpenRouter monetary amount.");
  }
  const raw = String(value).trim();
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(raw);
  if (!match) throw new Error("Invalid OpenRouter monetary amount.");
  const exponent = Number(match[3] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 25) {
    throw new Error("Unsupported OpenRouter monetary exponent.");
  }
  const digits = BigInt(match[1] + (match[2] ?? ""));
  const shift = scale - (match[2]?.length ?? 0) + exponent;
  if (shift >= 0) return digits * 10n ** BigInt(shift);
  const divisor = 10n ** BigInt(-shift);
  // Round microscopic provider amounts UP rather than silently underbilling.
  return (digits + divisor - 1n) / divisor;
}

function fixed(value: bigint, scale: number): string {
  const divisor = 10n ** BigInt(scale);
  const whole = value / divisor;
  const frac = (value % divisor).toString().padStart(scale, "0");
  return `${whole}.${frac}`;
}

export function parseAiUnits(value: string): bigint {
  // Six decimal digits of AI Units, never float arithmetic.
  return scaledDecimal(value, 6);
}

export function displayAiUnits(microunits: bigint): string {
  if (microunits < 0n) return "-" + fixed(-microunits, 6);
  return fixed(microunits, 6);
}

export function costUsdToAiUnits(value: number | string): string {
  // USD 1e-10 corresponds to one hundredth of an AI microunit.
  const usdScale10 = scaledDecimal(value, 10);
  const microunits = (usdScale10 + 99n) / 100n;
  return displayAiUnits(microunits);
}

export function normalizeCostUsd(value: number | string): string {
  return fixed(scaledDecimal(value, 10), 10);
}

export interface OpenRouterCostUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  costUsd: string;
  aiUnits: string;
}

function validTokens(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? value as number : null;
}

export function extractOpenRouterUsage(body: unknown): OpenRouterCostUsage {
  if (!body || typeof body !== "object") throw new Error("OpenRouter response missing usage.");
  const usage = (body as any).usage;
  if (!usage || typeof usage !== "object"
    || (typeof usage.cost !== "number" && typeof usage.cost !== "string")) {
    throw new Error("OpenRouter response missing billable usage.cost.");
  }
  const costUsd = normalizeCostUsd(usage.cost);
  return {
    promptTokens: validTokens(usage.prompt_tokens),
    completionTokens: validTokens(usage.completion_tokens),
    costUsd,
    aiUnits: costUsdToAiUnits(usage.cost)
  };
}

export interface TextModelPricing {
  prompt: string;
  completion: string;
  request: string;
}

/**
 * Conservative preauthorization estimate from catalog pricing in USD per
 * token + per request. Caller must specify *bounded* input/output token maxima
 * and apply an additional risk factor for uncertain provider/model features.
 */
export function estimateMaxAiUnits(
  pricing: TextModelPricing,
  maxInputTokens: number,
  maxOutputTokens: number,
  riskFactor = 2
): string {
  if (![maxInputTokens, maxOutputTokens, riskFactor].every(Number.isSafeInteger)
      || maxInputTokens < 0 || maxOutputTokens <= 0
      || riskFactor < 1 || riskFactor > 10) {
    throw new Error("Invalid preauthorization bounds.");
  }
  // Prices are in USD per token; round per-term up at 10 decimal places.
  const scale10 = scaledDecimal(pricing.prompt, 10) * BigInt(maxInputTokens)
    + scaledDecimal(pricing.completion, 10) * BigInt(maxOutputTokens)
    + scaledDecimal(pricing.request, 10);
  const reserveMicrounits = (scale10 * BigInt(riskFactor) + 99n) / 100n;
  // A request must reserve at least one microunit, including zero-priced models.
  return displayAiUnits(reserveMicrounits > 0n ? reserveMicrounits : 1n);
}
