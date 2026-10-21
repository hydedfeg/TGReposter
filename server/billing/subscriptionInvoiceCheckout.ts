import {getPostgresPool} from "../utils/postgresPool";
import {parseFixedDecimal} from "./checkoutQuoteService";
import type {CryptoPaymentInvoiceRecord} from "../repositories/cryptoPaymentRepository";
import {CryptoPaymentInvoiceService} from "../payments/invoiceService";
import type {CryptoPaymentNetwork} from "../payments/types";
import {prepareSubscriptionOrder, checkSubscriptionInvoiceEligibility,
  type SubscriptionOrderRecord,SubscriptionCheckoutError} from "./subscriptionCheckoutService";

/**
 * Trusted composition. Price always comes from a live, owner-scoped server quote.
 * The five-minute FX quote is for starting checkout, not for completing a
 * blockchain transfer. Once issued, the exact payable amount is locked for
 * forty-five minutes and cannot be repriced by the browser.
 */
export const CHECKOUT_INVOICE_TTL_MS = 45 * 60_000;

export function assertCheckoutInvoiceIdentity(
  invoice: Pick<CryptoPaymentInvoiceRecord,"network"|"requested_amount">,
  network: CryptoPaymentNetwork,
  quotedAmount: string
): void {
  if (invoice.network !== network ||
      parseFixedDecimal(invoice.requested_amount,18) !== parseFixedDecimal(quotedAmount,18)) {
    throw new SubscriptionCheckoutError("INVOICE_CONFLICT",
      "This quote is already attached to a different payment.");
  }
}

export function assertCheckoutInvoiceMatches(
  invoice: Pick<CryptoPaymentInvoiceRecord,"network"|"requested_amount"|"status"|"expires_at">,
  network: CryptoPaymentNetwork,
  quotedAmount: string,
  now: number = Date.now()
): void {
  assertCheckoutInvoiceIdentity(invoice,network,quotedAmount);
  if (invoice.status !== "pending" || new Date(invoice.expires_at).getTime() <= now) {
    throw new SubscriptionCheckoutError("INVOICE_NOT_PENDING","Create a new quote for this payment.");
  }
}
export async function createSubscriptionCheckoutInvoice(
  ownerPrincipal:string,
  quoteId:string,
  network:CryptoPaymentNetwork,
  deps:{
    invoiceService?:Pick<CryptoPaymentInvoiceService,"createInvoice">;
    prepare?:typeof prepareSubscriptionOrder;
    preflight?:typeof checkSubscriptionInvoiceEligibility;
    /** Dependency injection for local synthetic tests only. */
    query?: (sql:string,params:unknown[])=>Promise<{rows:any[]}>;
  }={}
):Promise<{order:SubscriptionOrderRecord; invoiceId:string; expectedAmount:string}> {
  if(process.env.TGREPOSTER_SUBSCRIPTION_CHECKOUT_ENABLED!=="true") {
    throw new SubscriptionCheckoutError("CHECKOUT_DISABLED","Subscription checkout is disabled.");
  }
  const owner=ownerPrincipal.trim().toLowerCase();
  if(!owner || owner.length>255) throw new SubscriptionCheckoutError("INVALID_OWNER","Invalid owner.");
  const query=deps.query ?? ((sql:string,params:unknown[])=>getPostgresPool().query(sql,params));
  const {rows}=await query(
    `select product_kind,plan_id,billing_interval,expires_at,usdt_amount::text
     from public.billing_fx_quotes
     where owner_principal=$1 and id=$2::uuid`,[owner,quoteId]);
  const quote=rows[0];
  if(quote?.product_kind!=="subscription") {
    throw new SubscriptionCheckoutError("QUOTE_NOT_FOUND",
      "Subscription quote not found.");
  }

  // An accepted order outlives its 5-minute FX quote. Resolve the existing
  // owner-scoped invoice without creating another reservation, even if the
  // invoice has since been paid or expired. The UI reads its current status.
  const {rows:existing}=await query(
    `select o.id as order_id,o.plan_id,o.billing_interval,o.status as order_status,
            i.id as invoice_id,i.network,i.requested_amount::text,
            i.expected_amount::text
     from public.billing_subscription_orders o
     join public.crypto_payment_invoices i
       on i.owner_principal=o.owner_principal and i.id=o.invoice_id
     where o.owner_principal=$1 and o.quote_id=$2::uuid
     limit 1`,[owner,quoteId]);
  if(existing.length) {
    const saved=existing[0];
    assertCheckoutInvoiceIdentity(saved,network,quote.usdt_amount);
    if(saved.plan_id!==quote.plan_id || saved.billing_interval!==quote.billing_interval) {
      throw new SubscriptionCheckoutError("ORDER_CONFLICT",
        "The existing order does not match its quote.");
    }
    return {
      order:{orderId:saved.order_id,planId:saved.plan_id,
        interval:saved.billing_interval,status:saved.order_status,created:false},
      invoiceId:saved.invoice_id,expectedAmount:saved.expected_amount
    };
  }

  const expiry=quote?.expires_at ? new Date(quote.expires_at).getTime():0;
  if(!Number.isFinite(expiry) || expiry-Date.now()<60_000) {
    throw new SubscriptionCheckoutError("QUOTE_EXPIRED",
      "Create a fresh subscription quote before requesting a payment invoice.");
  }

  // Reject invalid changes and unresolved prior payments before creating
  // a payable invoice. The order preparation transaction also rechecks.
  await (deps.preflight ?? checkSubscriptionInvoiceEligibility)(
    owner,quoteId,quote.plan_id,quote.billing_interval,{query}
  );

  // Idempotent for the quote; existing invoice service enforces uniqueness
  // of (owner_principal, request_key) and reserves unique chain amounts.
  const invoice=await (deps.invoiceService ?? new CryptoPaymentInvoiceService()).createInvoice(
    owner,{
      network,baseAmount:quote.usdt_amount,
      expiresAt:new Date(Date.now() + CHECKOUT_INVOICE_TTL_MS).toISOString(),
      requestKey:`subscription-quote:${quoteId}`
    });
  assertCheckoutInvoiceMatches(invoice,network,quote.usdt_amount);
  const order=await (deps.prepare ?? prepareSubscriptionOrder)(owner,quoteId,invoice.id);
  return {order,invoiceId:invoice.id,expectedAmount:invoice.expected_amount};
}
