import {getPostgresPool} from "../utils/postgresPool";
import {parseFixedDecimal} from "./checkoutQuoteService";
import type {CryptoPaymentInvoiceRecord} from "../repositories/cryptoPaymentRepository";
import {CryptoPaymentInvoiceService} from "../payments/invoiceService";
import type {CryptoPaymentNetwork} from "../payments/types";
import {prepareSubscriptionOrder, type SubscriptionOrderRecord,SubscriptionCheckoutError} from "./subscriptionCheckoutService";

/**
 * Trusted composition. Price always comes from a live, owner-scoped server quote.
 * The five-minute FX quote is for starting checkout, not for completing a
 * blockchain transfer. Once issued, the exact payable amount is locked for
 * forty-five minutes and cannot be repriced by the browser.
 */
export const CHECKOUT_INVOICE_TTL_MS = 45 * 60_000;

export function assertCheckoutInvoiceMatches(
  invoice: Pick<CryptoPaymentInvoiceRecord,"network"|"requested_amount"|"status"|"expires_at">,
  network: CryptoPaymentNetwork,
  quotedAmount: string,
  now: number = Date.now()
): void {
  if (invoice.network !== network ||
      parseFixedDecimal(invoice.requested_amount,18) !== parseFixedDecimal(quotedAmount,18)) {
    throw new SubscriptionCheckoutError("INVOICE_CONFLICT",
      "This quote is already attached to a different payment.");
  }
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
  }={}
):Promise<{order:SubscriptionOrderRecord; invoiceId:string; expectedAmount:string}> {
  if(process.env.TGREPOSTER_SUBSCRIPTION_CHECKOUT_ENABLED!=="true") {
    throw new SubscriptionCheckoutError("CHECKOUT_DISABLED","Subscription checkout is disabled.");
  }
  const owner=ownerPrincipal.trim().toLowerCase();
  if(!owner || owner.length>255) throw new SubscriptionCheckoutError("INVALID_OWNER","Invalid owner.");
  const {rows}=await getPostgresPool().query<{
    product_kind:string;expires_at:Date|string;usdt_amount:string;
  }>(
    `select product_kind,expires_at,usdt_amount::text
     from public.billing_fx_quotes
     where owner_principal=$1 and id=$2::uuid`,[owner,quoteId]);
  const quote=rows[0];
  const expiry=quote?.expires_at ? new Date(quote.expires_at).getTime():0;
  if(quote?.product_kind!=="subscription" || !Number.isFinite(expiry)
     || expiry-Date.now()<60_000) {
    throw new SubscriptionCheckoutError("QUOTE_EXPIRED",
      "Create a fresh subscription quote before requesting a payment invoice.");
  }

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
