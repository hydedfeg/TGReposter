import { getPostgresPool } from "../utils/postgresPool";
import { createCheckoutQuote } from "./checkoutQuoteService";
import { createSubscriptionCheckoutInvoice } from "./subscriptionInvoiceCheckout";
import { loadCryptoPaymentNetworkConfigs } from "../payments/paymentConfig";
import { normalizeBillingOwner } from "./billingOverviewService";
import type { CryptoPaymentNetwork } from "../payments/types";

type Environment = Record<string, string | undefined>;
const PURCHASABLE_PLANS = ["creator", "professional", "business", "agency"] as const;

export type CustomerCheckoutNetwork = CryptoPaymentNetwork;

export function isCustomerCheckoutEnabled(env: Environment = process.env): boolean {
  return env.TGREPOSTER_CUSTOMER_CHECKOUT_ENABLED === "true" &&
    env.TGREPOSTER_SUBSCRIPTION_CHECKOUT_ENABLED === "true" &&
    env.CRYPTO_PAYMENTS_ENABLED === "true";
}

export class CustomerCheckoutError extends Error {
  constructor(public readonly code: string) {
    super("Customer checkout request could not be completed.");
    this.name = "CustomerCheckoutError";
  }
}

export interface CheckoutOrderView {
  orderId: string;
  invoiceId: string;
  planId: string;
  interval: string;
  orderStatus: string;
  paymentStatus: string;
  listedEurCents: number;
  network: CryptoPaymentNetwork;
  asset: "USDT";
  amount: string;
  receivingAddress: string;
  tokenIdentifier: string;
  expiresAt: string;
  confirmedAt: string | null;
}

function requireCheckout(): void {
  if (!isCustomerCheckoutEnabled()) throw new CustomerCheckoutError("CHECKOUT_DISABLED");
}

function iso(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(value as string);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/** No unpublished plans or merchant/payment identity in the discovery endpoint. */
export async function getCustomerCheckoutCatalog(): Promise<{
  enabled: boolean;
  plans: Array<{ id: string; name: string; monthlyEurCents: number; annualEurCents: number }>;
  networks: CryptoPaymentNetwork[];
}> {
  if (!isCustomerCheckoutEnabled()) return { enabled: false, plans: [], networks: [] };
  const networks = loadCryptoPaymentNetworkConfigs().map(config => config.id);
  if (!networks.length) return { enabled: false, plans: [], networks: [] };
  const { rows } = await getPostgresPool().query(
    `select id,display_name,monthly_eur_cents,annual_eur_cents
     from public.billing_plans
     where is_published=true and id=any($1::text[])
     order by array_position($1::text[],id)`,
    [PURCHASABLE_PLANS]
  );
  return {
    enabled: rows.length > 0,
    plans: rows.map(row => ({
      id: String(row.id), name: String(row.display_name),
      monthlyEurCents: Number(row.monthly_eur_cents),
      annualEurCents: Number(row.annual_eur_cents),
    })),
    networks,
  };
}

export async function createCustomerSubscriptionQuote(
  ownerPrincipal: string,
  planId: string,
  interval: "monthly" | "annual"
) {
  requireCheckout();
  if (!PURCHASABLE_PLANS.some(id => id === planId)) throw new CustomerCheckoutError("INVALID_PRODUCT");
  return createCheckoutQuote(normalizeBillingOwner(ownerPrincipal),{
    kind: "subscription", planId, interval
  });
}

/**
 * All payment instructions are loaded from the stored, owner-scoped invoice.
 * User-supplied amounts, fiat rates, merchant wallets and owner IDs are ignored.
 */
export async function getCustomerCheckoutOrder(
  ownerPrincipal: string,
  orderId: string
): Promise<CheckoutOrderView | null> {
  const owner = normalizeBillingOwner(ownerPrincipal);
  const { rows } = await getPostgresPool().query(
    `select o.id as order_id,o.plan_id,o.billing_interval,o.status as order_status,
            o.listed_eur_cents,i.id as invoice_id,i.status as payment_status,
            i.asset_code,i.network,i.expected_amount::text as amount,
            i.receiving_address,i.token_identifier,i.expires_at,i.confirmed_at
       from public.billing_subscription_orders o
       join public.crypto_payment_invoices i
         on i.owner_principal=o.owner_principal and i.id=o.invoice_id
      where o.owner_principal=$1 and o.id=$2::uuid
      limit 1`,
    [owner,orderId]
  );
  const record = rows[0];
  if (!record) return null;
  return {
    orderId: record.order_id, invoiceId: record.invoice_id,
    planId:record.plan_id, interval:record.billing_interval,
    orderStatus:record.order_status, paymentStatus:record.payment_status,
    listedEurCents:Number(record.listed_eur_cents),
    network:record.network, asset:"USDT", amount:String(record.amount),
    receivingAddress:record.receiving_address,
    tokenIdentifier:record.token_identifier,
    expiresAt:iso(record.expires_at) ?? "",
    confirmedAt:iso(record.confirmed_at)
  };
}

export async function createCustomerSubscriptionOrder(
  ownerPrincipal: string,
  quoteId: string,
  network: CryptoPaymentNetwork
): Promise<CheckoutOrderView> {
  requireCheckout();
  if (!loadCryptoPaymentNetworkConfigs().some(config => config.id===network)) {
    throw new CustomerCheckoutError("NETWORK_UNAVAILABLE");
  }
  const owner = normalizeBillingOwner(ownerPrincipal);
  const { order } = await createSubscriptionCheckoutInvoice(owner,quoteId,network);
  const details = await getCustomerCheckoutOrder(owner,order.orderId);
  if (!details) throw new CustomerCheckoutError("ORDER_UNAVAILABLE");
  return details;
}
