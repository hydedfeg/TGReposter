import {getPostgresPool} from "../utils/postgresPool";
import {CryptoPaymentInvoiceService} from "../payments/invoiceService";
import type {CryptoPaymentNetwork} from "../payments/types";
import {prepareSubscriptionOrder, type SubscriptionOrderRecord,SubscriptionCheckoutError} from "./subscriptionCheckoutService";

/**
 * Internal-only composition; no public route invokes this yet.
 * Invoice amount is ALWAYS read from the server-issued quote.
 */
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
      expiresAt:new Date(expiry).toISOString(),
      requestKey:`subscription-quote:${quoteId}`
    });
  const order=await (deps.prepare ?? prepareSubscriptionOrder)(owner,quoteId,invoice.id);
  return {order,invoiceId:invoice.id,expectedAmount:invoice.expected_amount};
}
