import { getPostgresPool } from "../utils/postgresPool";
import { CryptoPaymentInvoiceService } from "../payments/invoiceService";
import type { CryptoPaymentNetwork } from "../payments/types";
import { prepareTopupOrder, AITopupError } from "./aiTopupService";
import { CHECKOUT_INVOICE_TTL_MS, assertCheckoutInvoiceMatches } from "./subscriptionInvoiceCheckout";

/**
 * Non-custodial AI credit checkout. This only prepares a server-quoted
 * invoice and order. The existing verified billing worker grants credits.
 */
export async function createTopupCheckoutInvoice(
  ownerPrincipal:string,quoteId:string,network:CryptoPaymentNetwork,
  deps:{
    invoiceService?:Pick<CryptoPaymentInvoiceService,"createInvoice">;
    prepare?:typeof prepareTopupOrder;
    /** Isolated synthetic tests inject an ephemeral database query. */
    query?: (sql:string,params:unknown[])=>Promise<{rows:any[]}>;

  }={}
):Promise<{order:{orderId:string;units:string;fulfilled:boolean;created:boolean};invoiceId:string}> {
  if(process.env.TGREPOSTER_CUSTOMER_CHECKOUT_ENABLED!=="true" ||
     process.env.TGREPOSTER_SUBSCRIPTION_CHECKOUT_ENABLED!=="true" ||
     process.env.TGREPOSTER_COMMERCIAL_TOPUPS_ENABLED!=="true" ||
     process.env.TGREPOSTER_COMMERCIAL_AI_ENABLED!=="true" ||
     process.env.TGREPOSTER_BILLING_WORKER_ENABLED!=="true" ||
     process.env.CRYPTO_PAYMENTS_ENABLED!=="true") {
    throw new AITopupError("NOT_LAUNCHED","AI Unit top-up checkout is disabled.");
  }
  const owner=ownerPrincipal.trim().toLowerCase();
  if(!owner||owner.length>255)throw new AITopupError("INVALID_OWNER","Invalid owner.");
  const query=deps.query ?? ((sql:string,params:unknown[])=>getPostgresPool().query(sql,params));
  const {rows}=await query(
    `select product_kind,pack_id,eur_cents,expires_at,usdt_amount::text
     from public.billing_fx_quotes
     where owner_principal=$1 and id=$2::uuid`,[owner,quoteId]);
  const quote=rows[0];
  const expiry=quote?.expires_at?new Date(quote.expires_at).getTime():0;
  if(quote?.product_kind!=="topup"||!quote.pack_id||
     !Number.isFinite(expiry)||expiry-Date.now()<60_000)
    throw new AITopupError("INVALID_QUOTE","Create a fresh top-up quote.");
  // A published price may change after a quote was issued. Reject a
  // withdrawn/repriced pack before reserving a payable invoice. The existing
  // order path is idempotent and must survive a later catalog withdrawal.
  const {rows:prepared}=await query(
    `select id from public.billing_ai_topup_orders
     where owner_principal=$1 and quote_reference=$2 limit 1`,
    [owner,quoteId]
  );
  if(!prepared.length) {
    const {rows:packs}=await query(
      `select is_published,price_eur_cents
       from public.billing_ai_topup_packs where id=$1`,[quote.pack_id]
    );
    const pack=packs[0];
    if(!pack?.is_published) {
      throw new AITopupError("PACK_NOT_AVAILABLE","AI top-up pack is not for sale.");
    }
    if(!Number.isSafeInteger(quote.eur_cents) ||
       quote.eur_cents!==pack.price_eur_cents) {
      throw new AITopupError("QUOTE_PRICE_CHANGED",
        "Pack price changed; request a fresh quote.");
    }
  }
  const invoice=await (deps.invoiceService??new CryptoPaymentInvoiceService()).createInvoice(
    owner,{
      network,baseAmount:quote.usdt_amount,
      expiresAt:new Date(Date.now()+CHECKOUT_INVOICE_TTL_MS).toISOString(),
      requestKey:`topup-quote:${quoteId}`
    }
  );
  assertCheckoutInvoiceMatches(invoice,network,quote.usdt_amount);
  const order=await (deps.prepare??prepareTopupOrder)({
    ownerPrincipal:owner,invoiceId:invoice.id,packId:quote.pack_id,
    quotedUsdtAmount:quote.usdt_amount,quoteReference:quoteId
  });
  return {order,invoiceId:invoice.id};
}
