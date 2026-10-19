import { getPostgresPool } from "../utils/postgresPool";
import { createCheckoutQuote } from "./checkoutQuoteService";
import { createSubscriptionCheckoutInvoice } from "./subscriptionInvoiceCheckout";
import { createTopupCheckoutInvoice } from "./topupInvoiceCheckout";
import { loadCryptoPaymentNetworkConfigs } from "../payments/paymentConfig";
import { normalizeBillingOwner } from "./billingOverviewService";
import {isPaidPlanCandidate,CUSTOM_PLAN_CHECKOUT_SWITCH} from "./customPlanEligibility";
import type { CryptoPaymentNetwork } from "../payments/types";

type Environment = Record<string, string | undefined>;
export const CUSTOMER_PLAN_CATALOG_SQL = `select id,display_name,monthly_eur_cents,annual_eur_cents
       from public.billing_plans
       where (id=any($1::text[]) or ($3::boolean=true and id ~ '^custom_[a-z][a-z0-9_]{2,29}$'))
         and is_enabled=true and ($2::boolean=false or is_published=true)
       order by sort_order`;
const PURCHASABLE_PLANS = ["creator", "professional", "business", "agency"] as const;
const PURCHASABLE_TOPUPS = ["ai_mini","ai_plus","ai_pro","ai_max"] as const;

export type CustomerCheckoutNetwork = CryptoPaymentNetwork;

export function isCustomerCheckoutEnabled(env: Environment = process.env): boolean {
  return env.TGREPOSTER_CUSTOMER_CHECKOUT_ENABLED === "true" &&
    env.TGREPOSTER_SUBSCRIPTION_CHECKOUT_ENABLED === "true" &&
    env.CRYPTO_PAYMENTS_ENABLED === "true" &&
    env.TGREPOSTER_BILLING_WORKER_ENABLED === "true";
}

export function isTopupCheckoutEnabled(env:Environment=process.env):boolean {
  return isCustomerCheckoutEnabled(env) &&
    env.TGREPOSTER_COMMERCIAL_TOPUPS_ENABLED === "true" &&
    env.TGREPOSTER_COMMERCIAL_AI_ENABLED === "true";
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
  kind: "subscription"|"topup";
  planId: string|null;
  packId: string|null;
  aiUnits: string|null;
  interval: string|null;
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

/** Disabled commerce can expose catalog pricing as a read-only preview.
 * No merchant addresses, invoices, secrets or payable rates are exposed.
 */
export async function getCustomerCheckoutCatalog():Promise<{
  enabled:boolean;
  topupsEnabled:boolean;
  plans:Array<{id:string;name:string;monthlyEurCents:number;annualEurCents:number}>;
  packs:Array<{id:string;name:string;aiUnits:string;priceEurCents:number}>;
  networks:CryptoPaymentNetwork[];
}> {
  const active=isCustomerCheckoutEnabled();
  const topups=isTopupCheckoutEnabled();
  const networks=active?loadCryptoPaymentNetworkConfigs().map(c=>c.id):[];
  const [p,k]=await Promise.all([
    getPostgresPool().query(
      CUSTOMER_PLAN_CATALOG_SQL,[PURCHASABLE_PLANS,active,active&&process.env[CUSTOM_PLAN_CHECKOUT_SWITCH]==="true"]),
    getPostgresPool().query(
      `select id,label,ai_units::text as ai_units,price_eur_cents
       from public.billing_ai_topup_packs
       where id=any($1::text[]) and ($2::boolean=false or is_published=true)
       order by array_position($1::text[],id)`,[PURCHASABLE_TOPUPS,topups])
  ]);
  const plans=p.rows.map(row=>({
    id:String(row.id),name:String(row.display_name),
    monthlyEurCents:Number(row.monthly_eur_cents),annualEurCents:Number(row.annual_eur_cents)
  }));
  const packs=k.rows.map(row=>({
    id:String(row.id),name:String(row.label),
    aiUnits:String(row.ai_units),priceEurCents:Number(row.price_eur_cents)
  }));
  const enabled=active&&networks.length>0&&plans.length>0;
  return {enabled,topupsEnabled:enabled&&topups&&packs.length>0,
    plans,packs,networks:enabled?networks:[]};
}

export async function createCustomerSubscriptionQuote(
  ownerPrincipal: string,
  planId: string,
  interval: "monthly" | "annual"
) {
  requireCheckout();
  if (!isPaidPlanCandidate(planId)) throw new CustomerCheckoutError("INVALID_PRODUCT");
  return createCheckoutQuote(normalizeBillingOwner(ownerPrincipal),{
    kind: "subscription", planId, interval
  });
}

export async function createCustomerTopupQuote(ownerPrincipal:string,packId:string){
  if(!isTopupCheckoutEnabled())throw new CustomerCheckoutError("TOPUPS_DISABLED");
  if(!PURCHASABLE_TOPUPS.some(id=>id===packId))throw new CustomerCheckoutError("INVALID_PRODUCT");
  return createCheckoutQuote(normalizeBillingOwner(ownerPrincipal),{kind:"topup",packId});
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
  // Each half is explicitly owner-filtered; another account's order is a 404.
  const {rows}=await getPostgresPool().query(
    `select o.id as order_id,'subscription'::text as kind,o.plan_id,
            null::text as pack_id,null::text as ai_units,
            o.billing_interval,o.status as order_status,
            o.listed_eur_cents,i.id as invoice_id,i.status as payment_status,
            i.network,i.expected_amount::text as amount,
            i.receiving_address,i.token_identifier,i.expires_at,i.confirmed_at
       from public.billing_subscription_orders o
       join public.crypto_payment_invoices i
         on i.owner_principal=o.owner_principal and i.id=o.invoice_id
      where o.owner_principal=$1 and o.id=$2::uuid
      union all
      select o.id as order_id,'topup'::text as kind,null::text as plan_id,
            o.pack_id,o.ai_units::text as ai_units,
            null::text as billing_interval,o.status as order_status,
            o.listed_eur_cents,i.id as invoice_id,i.status as payment_status,
            i.network,i.expected_amount::text as amount,
            i.receiving_address,i.token_identifier,i.expires_at,i.confirmed_at
       from public.billing_ai_topup_orders o
       join public.crypto_payment_invoices i
         on i.owner_principal=o.owner_principal and i.id=o.invoice_id
      where o.owner_principal=$1 and o.id=$2::uuid
      limit 1`,[owner,orderId]
  );
  const record=rows[0];
  if(!record)return null;
  return {
    orderId:record.order_id,invoiceId:record.invoice_id,
    kind:record.kind,planId:record.plan_id,packId:record.pack_id,
    aiUnits:record.ai_units,interval:record.billing_interval,
    orderStatus:record.order_status,paymentStatus:record.payment_status,
    listedEurCents:Number(record.listed_eur_cents),
    network:record.network,asset:"USDT",amount:String(record.amount),
    receivingAddress:record.receiving_address,
    tokenIdentifier:record.token_identifier,
    expiresAt:iso(record.expires_at)??"",confirmedAt:iso(record.confirmed_at)
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

export async function createCustomerTopupOrder(
  ownerPrincipal:string,quoteId:string,network:CryptoPaymentNetwork
):Promise<CheckoutOrderView>{
  if(!isTopupCheckoutEnabled())throw new CustomerCheckoutError("TOPUPS_DISABLED");
  if(!loadCryptoPaymentNetworkConfigs().some(c=>c.id===network))
    throw new CustomerCheckoutError("NETWORK_UNAVAILABLE");
  const owner=normalizeBillingOwner(ownerPrincipal);
  const {order}=await createTopupCheckoutInvoice(owner,quoteId,network);
  const result=await getCustomerCheckoutOrder(owner,order.orderId);
  if(!result||result.kind!=="topup")throw new CustomerCheckoutError("ORDER_UNAVAILABLE");
  return result;
}
