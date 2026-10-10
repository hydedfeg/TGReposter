import { getPostgresPool } from "../utils/postgresPool";
import { addUtcMonths } from "./monthlyAIAllowance";

export class SubscriptionCheckoutError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "SubscriptionCheckoutError";
  }
}

function checkEnabled(): void {
  if (process.env.TGREPOSTER_SUBSCRIPTION_CHECKOUT_ENABLED !== "true") {
    throw new SubscriptionCheckoutError("CHECKOUT_DISABLED", "Subscription checkout is disabled.");
  }
}

function normalizeOwner(value: string): string {
  const owner = value.trim().toLowerCase();
  if (!owner || owner.length > 255) {
    throw new SubscriptionCheckoutError("INVALID_OWNER", "Invalid subscription owner.");
  }
  return owner;
}

function iso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

export interface SubscriptionOrderRecord {
  orderId: string;
  planId: string;
  interval: string;
  status: string;
  created: boolean;
}

/**
 * Links exactly one *server-issued* quote to exactly one owner-scoped invoice.
 * The existing invoice service is the sole authority allowed to originate
 * invoices; this layer never accepts arbitrary prices, rates or wallet data.
 */
export async function prepareSubscriptionOrder(
  ownerPrincipal: string,
  quoteId: string,
  invoiceId: string
): Promise<SubscriptionOrderRecord> {
  checkEnabled();
  const owner = normalizeOwner(ownerPrincipal);
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",
      [`tgreposter:ai-balance:${owner}`]);

    const {rows: quotes} = await client.query(
      `select id,plan_id,billing_interval,eur_cents,usdt_amount::text as usdt_amount,
         product_kind,expires_at
       from public.billing_fx_quotes where owner_principal=$1 and id=$2::uuid for update`,
      [owner, quoteId]);
    const quote = quotes[0];
    if (!quote || quote.product_kind !== "subscription") {
      throw new SubscriptionCheckoutError("QUOTE_NOT_FOUND", "Subscription quote not found.");
    }

    const {rows: existing} = await client.query(
      `select id,status,invoice_id,plan_id,billing_interval
       from public.billing_subscription_orders
       where owner_principal=$1 and quote_id=$2::uuid for update`,
      [owner,quoteId]);
    if (existing[0]) {
      const order=existing[0];
      if (String(order.invoice_id) !== invoiceId) {
        throw new SubscriptionCheckoutError("QUOTE_ALREADY_USED", "Quote belongs to a different invoice.");
      }
      await client.query("COMMIT");
      return {orderId:order.id,planId:order.plan_id,interval:order.billing_interval,
        status:order.status,created:false};
    }

    const {rows: clock} = await client.query("select now() as now");
    if (new Date(quote.expires_at).getTime() <= new Date(clock[0].now).getTime()) {
      throw new SubscriptionCheckoutError("QUOTE_EXPIRED", "Checkout quote has expired.");
    }

    const {rows: subRows} = await client.query(
      `select plan_id,billing_interval,status,current_period_end
       from public.billing_subscriptions where owner_principal=$1 for update`,[owner]);
    const subscription=subRows[0];
    if (subscription?.status === "active"
      && subscription.current_period_end
      && new Date(subscription.current_period_end) > new Date(clock[0].now)
      && (subscription.plan_id !== quote.plan_id
        || subscription.billing_interval !== quote.billing_interval)) {
      throw new SubscriptionCheckoutError("PLAN_CHANGE_NOT_READY",
        "Mid-cycle plan changes require an approved proration workflow.");
    }

    const {rows: scheduled} = await client.query(
      `select id from public.billing_subscription_terms
       where owner_principal=$1 and status='scheduled' limit 1`,[owner]);
    if (scheduled.length) {
      throw new SubscriptionCheckoutError("RENEWAL_ALREADY_SCHEDULED",
        "This subscription already has a paid future term.");
    }

    const {rows: invoices} = await client.query(
      `select id,status,requested_amount::text as requested_amount,expires_at
       from public.crypto_payment_invoices
       where owner_principal=$1 and id=$2::uuid for update`,
      [owner,invoiceId]);
    const invoice=invoices[0];
    if (!invoice || invoice.status !== "pending"
      || new Date(invoice.expires_at).getTime() <= new Date(clock[0].now).getTime()) {
      throw new SubscriptionCheckoutError("INVOICE_NOT_PENDING",
        "A valid pending payment invoice is required.");
    }
    const {rows: comparisons} = await client.query(
      "select ($1::numeric = $2::numeric) as matched",
      [invoice.requested_amount,quote.usdt_amount]);
    if (!comparisons[0]?.matched) {
      throw new SubscriptionCheckoutError("INVOICE_QUOTE_MISMATCH",
        "Invoice amount does not match the signed server quote.");
    }

    // Shared invoice pool: do not let a subscription invoice also buy AI credits.
    const {rows: used} = await client.query(
      `select exists(select 1 from public.billing_ai_topup_orders
                     where invoice_id=$1::uuid) as used_for_topup`,[invoiceId]);
    if (used[0]?.used_for_topup) {
      throw new SubscriptionCheckoutError("INVOICE_ALREADY_USED",
        "Invoice is attached to an AI top-up.");
    }

    const {rows} = await client.query(
      `insert into public.billing_subscription_orders
         (owner_principal,quote_id,invoice_id,plan_id,billing_interval,
          listed_eur_cents,quoted_usdt_amount)
       values($1,$2::uuid,$3::uuid,$4,$5,$6,$7::numeric)
       returning id`,
      [owner,quoteId,invoiceId,quote.plan_id,quote.billing_interval,
        quote.eur_cents,quote.usdt_amount]);
    await client.query("COMMIT");
    return {orderId:rows[0].id,planId:quote.plan_id,interval:quote.billing_interval,
      status:"pending",created:true};
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export interface SubscriptionFulfillment {
  orderId: string;
  planId: string;
  interval: string;
  termStart: string;
  termEnd: string;
  status: "active" | "scheduled";
  created: boolean;
}

/**
 * Paid invoice verification must use both the invoice status and a matching
 * confirmed chain event. We never rely on user-submitted transaction hashes.
 */
export function confirmedTransferQuery(): string {
  return `
    select exists(
      select 1 from public.crypto_payment_transactions t
      join public.crypto_payment_invoices i
        on t.owner_principal=i.owner_principal and t.invoice_id=i.id
      where t.owner_principal=$1 and t.invoice_id=$2::uuid
        and i.status='paid' and i.confirmed_at is not null
        and t.status='confirmed' and t.confirmed_at is not null and t.confirmations > 0
        and t.network=i.network and t.amount=i.expected_amount
        and ((t.network in ('bsc','ethereum')
              and lower(t.to_address)=lower(i.receiving_address)
              and lower(t.token_identifier)=lower(i.token_identifier))
             or (t.network='ton' and t.to_address=i.receiving_address
                 and t.token_identifier=i.token_identifier))
    ) as verified
  `;
}

export async function fulfillVerifiedSubscription(
  ownerPrincipal: string,
  orderId: string
): Promise<SubscriptionFulfillment> {
  checkEnabled();
  const owner=normalizeOwner(ownerPrincipal);
  const client=await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",
      [`tgreposter:ai-balance:${owner}`]);

    const {rows: orders}=await client.query(
      `select o.id,o.plan_id,o.billing_interval,o.status,o.quoted_usdt_amount::text,
          i.id as invoice_id,i.status as invoice_status,i.confirmed_at,
          i.requested_amount::text as invoice_amount
       from public.billing_subscription_orders o
       join public.crypto_payment_invoices i
         on i.owner_principal=o.owner_principal and i.id=o.invoice_id
       where o.owner_principal=$1 and o.id=$2::uuid
       for update of o,i`,[owner,orderId]);
    const order=orders[0];
    if (!order) throw new SubscriptionCheckoutError("ORDER_NOT_FOUND","Subscription order not found.");

    const {rows: existingTerm}=await client.query(
      `select term_start,term_end,status from public.billing_subscription_terms
       where owner_principal=$1 and order_id=$2::uuid`,[owner,order.id]);
    if (order.status==="fulfilled" && existingTerm[0]) {
      await client.query("COMMIT");
      return {orderId:order.id,planId:order.plan_id,interval:order.billing_interval,
        termStart:iso(existingTerm[0].term_start),termEnd:iso(existingTerm[0].term_end),
        status:existingTerm[0].status==="scheduled"?"scheduled":"active",created:false};
    }
    if (order.status!=="pending") {
      throw new SubscriptionCheckoutError("ORDER_NOT_PENDING","Order is not eligible for fulfillment.");
    }
    if (order.invoice_status!=="paid" || !order.confirmed_at) {
      throw new SubscriptionCheckoutError("PAYMENT_NOT_CONFIRMED","Payment is not confirmed.");
    }
    const {rows: payment}=await client.query(confirmedTransferQuery(),[owner,order.invoice_id]);
    const {rows: quoteMatch}=await client.query(
      "select ($1::numeric=$2::numeric) as matched",
      [order.quoted_usdt_amount,order.invoice_amount]);
    if (!payment[0]?.verified || !quoteMatch[0]?.matched) {
      throw new SubscriptionCheckoutError("PAYMENT_NOT_VERIFIED",
        "Payment is not fully matched to this subscription order.");
    }

    const {rows: subscriptionRows}=await client.query(
      `select plan_id,billing_interval,status,current_period_start,current_period_end
       from public.billing_subscriptions where owner_principal=$1 for update`,[owner]);
    const subscription=subscriptionRows[0];
    const {rows: nowRows}=await client.query("select now() as now");
    const now=new Date(nowRows[0].now);
    const active=subscription?.status==="active"
      && subscription.current_period_start && subscription.current_period_end
      && new Date(subscription.current_period_start) <= now
      && new Date(subscription.current_period_end) > now;
    if (active && (subscription.plan_id !== order.plan_id
      || subscription.billing_interval !== order.billing_interval)) {
      throw new SubscriptionCheckoutError("PLAN_CHANGE_NOT_READY",
        "Plan changes while active require separate proration and authorization.");
    }
    const {rows: scheduled}=await client.query(
      `select id from public.billing_subscription_terms
       where owner_principal=$1 and status='scheduled' for update`,[owner]);
    if (scheduled.length) {
      throw new SubscriptionCheckoutError("RENEWAL_ALREADY_SCHEDULED",
        "A future paid renewal already exists.");
    }
    const start=active ? new Date(subscription.current_period_end) : now;
    const intervalMonths=order.billing_interval==="annual"?12:1;
    const end=addUtcMonths(start,intervalMonths);
    if (!(end > start)) throw new SubscriptionCheckoutError("INVALID_TERM","Invalid subscription term.");

    // When an expired term is replaced, close historical state before adding
    // the newly activated term. Existing paid history is never deleted.
    if (!active) {
      await client.query(
        `update public.billing_subscription_terms set status='completed'
         where owner_principal=$1 and status='active'`,[owner]);
    }
    const nextStatus=active?"scheduled":"active";
    const {rows: term}=await client.query(
      `insert into public.billing_subscription_terms
         (owner_principal,order_id,plan_id,billing_interval,
          term_start,term_end,status,activated_at)
       values($1,$2::uuid,$3,$4,$5::timestamptz,$6::timestamptz,$7,
              case when $7='active' then now() else null end)
       returning id`,
      [owner,order.id,order.plan_id,order.billing_interval,
        start.toISOString(),end.toISOString(),nextStatus]);

    if (!active) {
      await client.query(
        `insert into public.billing_subscriptions
           (owner_principal,plan_id,billing_interval,status,payment_provider,
            current_period_start,current_period_end,updated_at)
         values($1,$2,$3,'active','crypto',$4::timestamptz,$5::timestamptz,now())
         on conflict(owner_principal) do update set
           plan_id=excluded.plan_id,billing_interval=excluded.billing_interval,
           status='active',payment_provider='crypto',
           current_period_start=excluded.current_period_start,
           current_period_end=excluded.current_period_end,
           updated_at=now()`,
        [owner,order.plan_id,order.billing_interval,start.toISOString(),end.toISOString()]);
    }
    await client.query(
      `update public.billing_subscription_orders
       set status='fulfilled',fulfilled_at=now(),updated_at=now()
       where id=$1::uuid and owner_principal=$2 and status='pending'`,
      [order.id,owner]);
    await client.query("COMMIT");
    return {orderId:order.id,planId:order.plan_id,interval:order.billing_interval,
      termStart:start.toISOString(),termEnd:end.toISOString(),
      status:nextStatus,created:true};
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Backend scheduler will call this at/after the paid renewal boundary.
 * No API and no cron is wired during this foundation phase.
 */
export async function activateDueSubscriptionTerm(
  ownerPrincipal: string
): Promise<boolean> {
  checkEnabled();
  const owner=normalizeOwner(ownerPrincipal);
  const client=await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",
      [`tgreposter:ai-balance:${owner}`]);
    const {rows}=await client.query(
      `select id,plan_id,billing_interval,term_start,term_end
       from public.billing_subscription_terms
       where owner_principal=$1 and status='scheduled'
         and term_start <= now() and term_end > now()
       for update`,[owner]);
    const term=rows[0];
    if (!term) {
      await client.query("COMMIT");
      return false;
    }
    await client.query(
      `update public.billing_subscription_terms set status='completed'
       where owner_principal=$1 and status='active'`,[owner]);
    await client.query(
      `update public.billing_subscription_terms
       set status='active',activated_at=now()
       where id=$1::uuid and owner_principal=$2 and status='scheduled'`,[term.id,owner]);
    await client.query(
      `update public.billing_subscriptions
       set plan_id=$2,billing_interval=$3,status='active',
         payment_provider='crypto',current_period_start=$4,
         current_period_end=$5,updated_at=now()
       where owner_principal=$1`,
      [owner,term.plan_id,term.billing_interval,term.term_start,term.term_end]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
