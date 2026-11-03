import type { PoolClient } from "pg";
import { getPostgresPool } from "../utils/postgresPool";
import { normalizeBillingOwner } from "./billingOverviewService";
import { confirmedTransferQuery } from "./subscriptionCheckoutService";
import { requiredBillingConfirmations } from "./confirmedPaymentPolicy";

export class PaymentRecordError extends Error {
  constructor(readonly code: string) { super(code); }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRODUCTS = {
  subscription: {
    table: "billing_subscription_orders", otherTable: "billing_ai_topup_orders", product: "o.plan_id", interval: "o.billing_interval", units: "null::text",
    fulfillment: `exists(select 1 from public.billing_subscription_terms s
      where s.owner_principal=o.owner_principal and s.order_id=o.id
        and s.plan_id=o.plan_id and s.billing_interval=o.billing_interval)`,
  },
  topup: {
    table: "billing_ai_topup_orders", otherTable: "billing_subscription_orders", product: "o.pack_id", interval: "null::text", units: "o.ai_units::text",
    fulfillment: `exists(select 1 from public.ai_unit_ledger l
      where l.owner_principal=o.owner_principal and l.event_key='topup:order:'||o.id::text
        and l.balance_type='purchased' and l.event_kind='grant' and l.units_delta=o.ai_units)`,
  },
} as const;

export async function getCustomerPaymentRecord(ownerPrincipal: string, type: string, id: string, options: {
  clientFactory?: () => Promise<Pick<PoolClient, "query" | "release">>;
  confirmationEnv?: Record<string, string | undefined>;
} = {}) {
  const owner = normalizeBillingOwner(ownerPrincipal);
  if (!Object.hasOwn(PRODUCTS, type) || !UUID.test(id)) throw new PaymentRecordError("INVALID_PAYMENT_RECORD_REQUEST");
  const p = PRODUCTS[type as keyof typeof PRODUCTS];
  const client = await (options.clientFactory ?? (() => getPostgresPool().connect()))();
  try {
    // All evidence is read from one consistent snapshot; never mutate financial data.
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const { rows } = await client.query(`select o.id,o.status,o.created_at,o.fulfilled_at,
      o.listed_eur_cents,${p.product} as product_id,${p.interval} as billing_interval,
      ${p.units} as ai_units,${p.fulfillment} as fulfillment_verified,
      not exists(select 1 from public.${p.otherTable} other_order where other_order.invoice_id=o.invoice_id) as sole_order,
      i.id as invoice_id,i.status as payment_status,i.confirmed_at,i.network,
      i.expected_amount::text as paid_usdt,(o.quoted_usdt_amount=i.requested_amount) as quote_matches
      from public.${p.table} o join public.crypto_payment_invoices i
        on i.owner_principal=o.owner_principal and i.id=o.invoice_id
      where o.owner_principal=$1 and o.id=$2::uuid`, [owner, id]);
    if (rows.length !== 1) throw new PaymentRecordError("PAYMENT_RECORD_NOT_FOUND");
    const row = rows[0];
    if (row.status !== "fulfilled" || row.payment_status !== "paid" || !row.confirmed_at ||
        !row.fulfillment_verified || !row.quote_matches || !row.sole_order) throw new PaymentRecordError("PAYMENT_RECORD_NOT_READY");
    const confirmations = requiredBillingConfirmations(row.network, options.confirmationEnv);
    const { rows: proof } = await client.query(confirmedTransferQuery(), [owner, row.invoice_id, confirmations]);
    if (proof[0]?.verified !== true) throw new PaymentRecordError("PAYMENT_RECORD_NOT_READY");
    const iso = (value: unknown) => {
      if (!value || !Number.isFinite(new Date(value as string).valueOf())) throw new Error("Invalid payment record timestamp");
      return new Date(value as string).toISOString();
    };
    if (!Number.isSafeInteger(row.listed_eur_cents) || row.listed_eur_cents <= 0 ||
        typeof row.paid_usdt !== "string" || !/^\d+(?:\.\d{1,18})?$/.test(row.paid_usdt) ||
        BigInt(row.paid_usdt.replace(".", "")) <= 0n) throw new Error("Invalid payment record amount");
    const record = {
      version: 1, documentType: "payment_record", taxInvoice: false,
      orderId: id.toLowerCase(), orderType: type, productId: String(row.product_id),
      billingInterval: row.billing_interval, aiUnits: row.ai_units,
      orderCreatedAt: iso(row.created_at), fulfilledAt: iso(row.fulfilled_at), paidAt: iso(row.confirmed_at),
      listedPrice: { currency: "EUR", amountMinor: row.listed_eur_cents },
      payment: { asset: "USDT", network: row.network, amount: row.paid_usdt },
    };
    await client.query("COMMIT");
    return record;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
