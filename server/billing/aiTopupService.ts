import { getPostgresPool } from "../utils/postgresPool";
import { displayAiUnits } from "./aiUnits";

/**
 * Commercial top-ups are prepared and fulfilled by trusted backend workflows.
 * This module has no HTTP routes, and does not create blockchain payments.
 */
export class AITopupError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "AITopupError";
  }
}

function normalizeOwner(value: string): string {
  const owner = value.trim().toLowerCase();
  if (!owner || owner.length > 255) throw new AITopupError("INVALID_OWNER", "Invalid customer owner.");
  return owner;
}

function requireTopupsEnabled(enabled?: boolean) {
  if (enabled !== true && process.env.TGREPOSTER_COMMERCIAL_TOPUPS_ENABLED !== "true") {
    throw new AITopupError("NOT_LAUNCHED", "Commercial AI top-ups are disabled.");
  }
}

function validQuote(value: string, reference: string) {
  if (!/^\d{1,15}(?:\.\d{1,18})?$/.test(value) || Number(value) <= 0) {
    throw new AITopupError("INVALID_QUOTE", "Invalid quoted USDT amount.");
  }
  if (reference.trim().length < 8 || reference.trim().length > 128) {
    throw new AITopupError("INVALID_QUOTE", "Invalid server quote reference.");
  }
}

export interface PrepareTopupOrderInput {
  ownerPrincipal: string;
  invoiceId: string;
  packId: string;
  /** Trusted backend quote, validated against the invoice's nominal amount. */
  quotedUsdtAmount: string;
  quoteReference: string;
}

export interface TopupOrderResult {
  orderId: string;
  units: string;
  fulfilled: boolean;
  created: boolean;
}

/**
 * Attach a NOT-YET-PAID invoice to one predefined product. The FX quote
 * conversion itself belongs to a later pricing/checkout service, not here.
 * Idempotency is enforced by unique invoice_id.
 */
export async function prepareTopupOrder(
  input: PrepareTopupOrderInput,
  options: { enabled?: boolean } = {}
): Promise<TopupOrderResult> {
  requireTopupsEnabled(options.enabled);
  const owner = normalizeOwner(input.ownerPrincipal);
  validQuote(input.quotedUsdtAmount, input.quoteReference);
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",
      [`tgreposter:ai-balance:${owner}`]);

    const { rows: packs } = await client.query(
      `select id, ai_units::text, price_eur_cents, is_published
       from public.billing_ai_topup_packs where id=$1`,
      [input.packId]
    );
    if (!packs[0]?.is_published) {
      throw new AITopupError("PACK_NOT_AVAILABLE", "AI top-up product is not launched.");
    }

    const { rows: invoices } = await client.query(
      `select id,status,requested_amount::text as requested_amount,expires_at
       from public.crypto_payment_invoices where owner_principal=$1
         and id=$2::uuid for update`,
      [owner,input.invoiceId]
    );
    const invoice = invoices[0];
    if (!invoice || invoice.status !== "pending" || new Date(invoice.expires_at) <= new Date()) {
      throw new AITopupError("INVALID_INVOICE", "A valid pending invoice is required.");
    }

    // Same nominal amount as checkout quote. The discriminator remains in
    // expected_amount and must never inflate the purchased product price.
    const { rows: amounts } = await client.query(
      "select ($1::numeric = $2::numeric) as matches",
      [invoice.requested_amount,input.quotedUsdtAmount]
    );
    if (!amounts[0]?.matches) {
      throw new AITopupError("QUOTE_MISMATCH", "Invoice does not match quoted purchase amount.");
    }

    const { rows: existing } = await client.query(
      `select id,pack_id,ai_units::text,quoted_usdt_amount::text,status,quote_reference
       from public.billing_ai_topup_orders where invoice_id=$1::uuid`,
      [input.invoiceId]
    );
    if (existing.length) {
      const order = existing[0];
      if (order.pack_id !== input.packId || order.quote_reference !== input.quoteReference) {
        throw new AITopupError("INVOICE_ALREADY_USED", "Invoice is attached to another order.");
      }
      await client.query("COMMIT");
      return { orderId:order.id,units:order.ai_units,fulfilled:order.status==="fulfilled",created:false };
    }

    const { rows } = await client.query(
      `insert into public.billing_ai_topup_orders
       (owner_principal,invoice_id,pack_id,ai_units,listed_eur_cents,
        quoted_usdt_amount,quote_reference)
       values($1,$2::uuid,$3,$4::numeric,$5,$6::numeric,$7)
       returning id,ai_units::text`,
      [owner,input.invoiceId,input.packId,packs[0].ai_units,packs[0].price_eur_cents,
        input.quotedUsdtAmount,input.quoteReference]
    );
    await client.query("COMMIT");
    return { orderId:rows[0].id,units:rows[0].ai_units,fulfilled:false,created:true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Atomic fulfillment: a confirmed, owner-matched, fully paid invoice is
 * necessary but not sufficient. The order must exist and remain pending.
 */
export async function fulfillVerifiedTopup(
  ownerPrincipal: string,
  orderId: string,
  options: { enabled?: boolean } = {}
): Promise<TopupOrderResult> {
  requireTopupsEnabled(options.enabled);
  const owner = normalizeOwner(ownerPrincipal);
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",
      [`tgreposter:ai-balance:${owner}`]);

    const { rows } = await client.query(
      `select o.id,o.ai_units::text,o.status,o.quoted_usdt_amount::text,
              i.status as invoice_status, i.requested_amount::text as invoice_amount,
              i.confirmed_at,i.id as invoice_id
       from public.billing_ai_topup_orders o
       join public.crypto_payment_invoices i
         on i.owner_principal=o.owner_principal and i.id=o.invoice_id
       where o.owner_principal=$1 and o.id=$2::uuid
       for update of o,i`,
      [owner,orderId]
    );
    const order = rows[0];
    if (!order) throw new AITopupError("ORDER_NOT_FOUND", "AI order not found.");
    if (order.status === "fulfilled") {
      await client.query("COMMIT");
      return { orderId:order.id,units:order.ai_units,fulfilled:true,created:false };
    }
    if (order.status !== "pending") {
      throw new AITopupError("ORDER_NOT_PENDING", "This order cannot be fulfilled.");
    }
    if (order.invoice_status !== "paid" || !order.confirmed_at) {
      throw new AITopupError("PAYMENT_NOT_CONFIRMED", "Invoice payment is not confirmed.");
    }

    const { rows: matches } = await client.query(
      `select ($1::numeric = $2::numeric) as amount_matches,
         exists (
           select 1 from public.crypto_payment_transactions t
           where t.owner_principal=$3 and t.invoice_id=$4::uuid
             and t.status='confirmed' and t.confirmed_at is not null
         ) as confirmed_transaction`,
      [order.quoted_usdt_amount,order.invoice_amount,owner,order.invoice_id]
    );
    if (!matches[0]?.amount_matches || !matches[0]?.confirmed_transaction) {
      throw new AITopupError("PAYMENT_NOT_VERIFIED", "Invoice lacks a matching confirmed transfer.");
    }

    const eventKey = `topup:order:${order.id}`;
    await client.query(
      `insert into public.ai_unit_ledger
       (owner_principal,event_key,balance_type,event_kind,units_delta,reference)
       values($1,$2,'purchased','grant',$3::numeric,$4)`,
      [owner,eventKey,order.ai_units,`topup:${order.id}`]
    );

    await client.query(
      `update public.billing_ai_topup_orders
       set status='fulfilled',fulfilled_at=now(),updated_at=now()
       where owner_principal=$1 and id=$2::uuid and status='pending'`,
      [owner,order.id]
    );
    await client.query("COMMIT");
    return { orderId:order.id,units:order.ai_units,fulfilled:true,created:true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
