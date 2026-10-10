import { getPostgresPool } from "../utils/postgresPool";
import { isPlanId } from "./planCatalog";

/**
 * Server-owned quote generation. No live checkout route uses this yet.
 * USDT is NOT assumed to equal USD; quote a direct USDT/EUR market pair.
 * Rates are sampled on Kraken's public USDTEUR spot book and never accepted
 * from customers.
 */
export const KRAKEN_USDTEUR_TICKER = "https://api.kraken.com/0/public/Ticker?pair=USDTEUR";
const EUR_SCALE = 1_000_000_000_000n;
const USDT_MICRO = 1_000_000n;
const QUOTE_TTL_MS = 5 * 60_000;
// Indicative spread / volatility buffer, not tax and not a processing fee.
const BUFFER_BASIS_POINTS = 150n;

export class CheckoutQuoteError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "CheckoutQuoteError";
  }
}

export type CheckoutProduct =
  | { kind: "subscription"; planId: string; interval: "monthly" | "annual" }
  | { kind: "topup"; packId: string };

export interface CheckoutQuote {
  id: string;
  ownerPrincipal: string;
  product: CheckoutProduct;
  eurCents: number;
  eurPerUsdt: string;
  usdtAmount: string;
  rateSource: "kraken:USDTEUR:ask";
  expiresAt: string;
}

export function parseFixedDecimal(value: unknown, places = 12): bigint {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw new CheckoutQuoteError("INVALID_MARKET_RATE", "Invalid market price.");
  }
  const [whole, fractional = ""] = value.split(".");
  if (fractional.length > places) {
    // Quote provider must supply sufficient precision we can preserve.
    throw new CheckoutQuoteError("INVALID_MARKET_RATE", "Market rate precision exceeds supported scale.");
  }
  const scaled = BigInt(whole) * 10n ** BigInt(places)
    + BigInt(fractional.padEnd(places, "0") || "0");
  if (scaled <= 0n) throw new CheckoutQuoteError("INVALID_MARKET_RATE", "Market rate must be positive.");
  return scaled;
}

export function formatFixedDecimal(value: bigint, places: number): string {
  const base = 10n ** BigInt(places);
  return `${value / base}.${(value % base).toString().padStart(places, "0")}`;
}

function ceilDivide(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

/** EUR cents -> conservatively rounded UP six-decimal USDT amount. */
export function euroCentsToUsdtAmount(eurCents: number, eurPerUsdt: string): string {
  if (!Number.isSafeInteger(eurCents) || eurCents <= 0 || eurCents > 100_000_000) {
    throw new CheckoutQuoteError("INVALID_PRICE", "Invalid listed EUR price.");
  }
  const rate = parseFixedDecimal(eurPerUsdt);
  // USDT purchase with EUR: ask price in EUR per USDT.
  const numerator = BigInt(eurCents) * USDT_MICRO * EUR_SCALE
    * (10_000n + BUFFER_BASIS_POINTS);
  const denominator = 100n * rate * 10_000n;
  return formatFixedDecimal(ceilDivide(numerator, denominator), 6);
}

/** Fail closed on malformed data, ambiguous ticker results and wide spreads. */
export function parseKrakenEurPerUsdt(body: unknown): string {
  const payload = body as any;
  if (!payload || !Array.isArray(payload.error) || payload.error.length
      || !payload.result || typeof payload.result !== "object") {
    throw new CheckoutQuoteError("MARKET_UNAVAILABLE", "USDT/EUR market data unavailable.");
  }
  const pairs = Object.values(payload.result);
  if (pairs.length !== 1) {
    throw new CheckoutQuoteError("MARKET_UNAVAILABLE", "Ambiguous USDT/EUR ticker.");
  }
  const ticker = pairs[0] as any;
  const ask = parseFixedDecimal(ticker?.a?.[0]);
  const bid = parseFixedDecimal(ticker?.b?.[0]);
  if (bid > ask || ask < 500_000_000_000n || ask > 2_000_000_000_000n) {
    throw new CheckoutQuoteError("MARKET_UNAVAILABLE", "USDT/EUR quote outside safety bounds.");
  }
  if ((ask - bid) * 10_000n > ask * 300n) {
    throw new CheckoutQuoteError("MARKET_UNAVAILABLE", "USDT/EUR spread is too wide.");
  }
  return formatFixedDecimal(ask,12);
}

export async function fetchKrakenEurPerUsdt(
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetchImpl(KRAKEN_USDTEUR_TICKER, {
      method:"GET",
      headers: { Accept:"application/json" },
      signal: controller.signal
    });
    if (!response.ok) throw new CheckoutQuoteError("MARKET_UNAVAILABLE", "Currency pricing unavailable.");
    return parseKrakenEurPerUsdt(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}

function checkEnabled() {
  if (process.env.TGREPOSTER_SUBSCRIPTION_CHECKOUT_ENABLED !== "true") {
    throw new CheckoutQuoteError("CHECKOUT_DISABLED", "Subscription checkout is not yet available.");
  }
}

/** The plan/pack and its price are loaded from backend catalog, never from the request. */
export async function createCheckoutQuote(
  ownerPrincipal: string,
  product: CheckoutProduct,
  options: { fetchRate?: typeof fetchKrakenEurPerUsdt; at?: Date } = {}
): Promise<CheckoutQuote> {
  checkEnabled();
  const owner = ownerPrincipal.trim().toLowerCase();
  if (!owner || owner.length > 255) {
    throw new CheckoutQuoteError("INVALID_OWNER", "Missing billing owner.");
  }
  let eurCents: number;
  if (product.kind === "subscription") {
    if (!isPlanId(product.planId) || ["free","enterprise"].includes(product.planId)
        || !["monthly","annual"].includes(product.interval)) {
      throw new CheckoutQuoteError("INVALID_PRODUCT", "Not a purchasable subscription.");
    }
    const { rows } = await getPostgresPool().query(
      `select monthly_eur_cents,annual_eur_cents,is_published
       from public.billing_plans where id=$1`, [product.planId]);
    if (!rows[0]?.is_published) throw new CheckoutQuoteError("PRODUCT_UNAVAILABLE", "Plan is not for sale.");
    eurCents = product.interval === "monthly"
      ? rows[0].monthly_eur_cents : rows[0].annual_eur_cents;
  } else if (product.kind === "topup") {
    const { rows } = await getPostgresPool().query(
      "select price_eur_cents,is_published from public.billing_ai_topup_packs where id=$1",
      [product.packId]);
    if (!rows[0]?.is_published) throw new CheckoutQuoteError("PRODUCT_UNAVAILABLE", "Pack is not for sale.");
    eurCents = rows[0].price_eur_cents;
  } else {
    throw new CheckoutQuoteError("INVALID_PRODUCT", "Unknown checkout product.");
  }
  const rate = await (options.fetchRate ?? fetchKrakenEurPerUsdt)();
  const amount = euroCentsToUsdtAmount(eurCents,rate);
  const now = options.at ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new CheckoutQuoteError("INVALID_TIME", "Invalid quote time.");
  const expiresAt = new Date(now.getTime()+QUOTE_TTL_MS).toISOString();
  const { rows } = await getPostgresPool().query<{ id:string }>(
    `insert into public.billing_fx_quotes
       (owner_principal,product_kind,plan_id,billing_interval,pack_id,eur_cents,
        eur_per_usdt,usdt_amount,rate_source,expires_at)
     values ($1,$2,$3,$4,$5,$6,$7::numeric,$8::numeric,$9,$10::timestamptz)
     returning id`,
    [owner, product.kind, product.kind==="subscription" ? product.planId:null,
      product.kind==="subscription" ? product.interval:null,
      product.kind==="topup" ? product.packId:null,
      eurCents,rate,amount,"kraken:USDTEUR:ask",expiresAt]
  );
  return {
    id:rows[0].id,ownerPrincipal:owner,product,eurCents,
    eurPerUsdt:rate,usdtAmount:amount,
    rateSource:"kraken:USDTEUR:ask",expiresAt
  };
}
