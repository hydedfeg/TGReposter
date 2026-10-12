import type { PoolClient } from "pg";
import { getPostgresPool } from "../utils/postgresPool";
import { normalizeBillingOwner } from "./billingOverviewService";

/**
 * Subscription lifecycle transitions, separate from payment checkout.
 * Both the feature gate and the owner identity must come from the backend.
 * This feature NEVER charges, refunds or upgrades an account.
 */

export class SubscriptionLifecycleError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "SubscriptionLifecycleError";
  }
}

export type LifecycleClient = Pick<PoolClient, "query" | "release">;
export type LifecycleClientFactory = () => Promise<LifecycleClient>;

export interface LifecycleOptions {
  enabled?: boolean;
  clientFactory?: LifecycleClientFactory;
}

export interface CancellationResult {
  cancelAtPeriodEnd: boolean;
  effectiveAt: string;
  changed: boolean;
}

function requireEnabled(options: LifecycleOptions) {
  if (options.enabled !== true
      && process.env.TGREPOSTER_SUBSCRIPTION_MANAGEMENT_ENABLED !== "true") {
    throw new SubscriptionLifecycleError(
      "MANAGEMENT_DISABLED", "Subscription management is not enabled."
    );
  }
}

function dateIso(value: unknown): string {
  const date = new Date(value as string);
  if (!Number.isFinite(date.valueOf())) {
    throw new SubscriptionLifecycleError("INVALID_PERIOD", "Subscription period is invalid.");
  }
  return date.toISOString();
}

async function lockOwner(client: LifecycleClient, owner: string): Promise<void> {
  await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    `tgreposter:ai-balance:${owner}`
  ]);
}

/**
 * Request end-of-term cancellation, or reverse that request.
 *
 * There is no recurring USDT debit currently. This flag expresses that
 * access ends at the paid term boundary unless another eligible term has
 * already been paid. We refuse changing it when any future paid renewal or
 * pending purchase requires explicit financial resolution.
 */
export async function setEndOfTermCancellation(
  ownerPrincipal: string,
  cancel: boolean,
  options: LifecycleOptions = {}
): Promise<CancellationResult> {
  requireEnabled(options);
  const owner = normalizeBillingOwner(ownerPrincipal);
  if (typeof cancel !== "boolean") {
    throw new SubscriptionLifecycleError("INVALID_ACTION", "Invalid cancellation action.");
  }
  const client = await (options.clientFactory ?? (()=>getPostgresPool().connect()))();
  try {
    await client.query("BEGIN");
    await lockOwner(client, owner);
    const {rows: subs} = await client.query(
      `select id,status,cancel_at_period_end,current_period_start,current_period_end
       from public.billing_subscriptions
       where owner_principal=$1 for update`,[owner]);
    const subscription=subs[0];
    if (!subscription || subscription.status!=="active") {
      throw new SubscriptionLifecycleError("NO_ACTIVE_SUBSCRIPTION",
        "A current paid subscription is required.");
    }
    const {rows: clock} = await client.query("select now() as now");
    const now=new Date(clock[0].now).getTime();
    const start=new Date(dateIso(subscription.current_period_start)).getTime();
    const end=new Date(dateIso(subscription.current_period_end)).getTime();
    if (start>now || now>=end) {
      throw new SubscriptionLifecycleError("PAID_PERIOD_ENDED",
        "Paid subscription period has ended.");
    }

    // Repeated cancel/restore calls are idempotent, no duplicate audit event.
    if (subscription.cancel_at_period_end===cancel) {
      await client.query("COMMIT");
      return { cancelAtPeriodEnd:cancel,effectiveAt:new Date(end).toISOString(),changed:false };
    }

    const {rows: outstanding} = await client.query(
      `select
         exists(select 1 from public.billing_subscription_terms
           where owner_principal=$1 and status='scheduled') as prepaid_term,
         exists(select 1 from public.billing_subscription_orders o
           join public.crypto_payment_invoices i
             on i.owner_principal=o.owner_principal and i.id=o.invoice_id
           where o.owner_principal=$1 and o.status='pending'
             and i.status not in ('expired','canceled')) as pending_order`,
      [owner]);
    if (outstanding[0]?.prepaid_term || outstanding[0]?.pending_order) {
      throw new SubscriptionLifecycleError("PAYMENT_REVIEW_REQUIRED",
        "Resolve outstanding or prepaid renewals before changing cancellation.");
    }

    const {rowCount}=await client.query(
      `update public.billing_subscriptions
       set cancel_at_period_end=$2,updated_at=now()
       where owner_principal=$1 and id=$3::uuid`,
      [owner,cancel,subscription.id]);
    if (rowCount!==1) {
      throw new SubscriptionLifecycleError("SUBSCRIPTION_CHANGED",
        "Subscription was modified concurrently.");
    }
    await client.query(
      `insert into public.billing_subscription_events
       (owner_principal,subscription_id,event_type)
       values($1,$2::uuid,$3)`,
      [owner,subscription.id,cancel?"cancel_scheduled":"cancel_reversed"]);
    await client.query("COMMIT");
    return {cancelAtPeriodEnd:cancel,effectiveAt:new Date(end).toISOString(),changed:true};
  } catch(error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Reconcile an expired paid snapshot and finish its active historical term.
 * If a paid scheduled renewal has become due, refuse to expire it: the
 * renewal worker must activate that term first. Expired/missed scheduled
 * terms require manual financial resolution, never silent forfeiture.
 */
export async function expireEndedSubscription(
  ownerPrincipal: string,
  options: LifecycleOptions = {}
): Promise<boolean> {
  requireEnabled(options);
  const owner=normalizeBillingOwner(ownerPrincipal);
  const client=await (options.clientFactory ?? (()=>getPostgresPool().connect()))();
  try {
    await client.query("BEGIN");
    await lockOwner(client,owner);
    const {rows: subs}=await client.query(
      `select id,status,current_period_end from public.billing_subscriptions
       where owner_principal=$1 for update`,[owner]);
    const subscription=subs[0];
    if (!subscription || subscription.status!=="active") {
      await client.query("COMMIT");
      return false;
    }
    const {rows: clock}=await client.query("select now() as now");
    const now=new Date(clock[0].now);
    const end=new Date(dateIso(subscription.current_period_end));
    if(now<end) {
      await client.query("COMMIT");
      return false;
    }
    const {rows: renewals}=await client.query(
      `select id,term_start,term_end from public.billing_subscription_terms
       where owner_principal=$1 and status='scheduled'
       order by term_start asc for update`,[owner]);
    const due=renewals.some(t=>new Date(t.term_start)<=now && new Date(t.term_end)>now);
    if(due) {
      // A paid, eligible renewal should be activated first.
      await client.query("COMMIT");
      return false;
    }
    if(renewals.some(t=>new Date(t.term_end)<=now)) {
      throw new SubscriptionLifecycleError("MISSED_PAID_RENEWAL",
        "Expired but unactivated prepaid term requires review.");
    }

    await client.query(
      `update public.billing_subscription_terms
       set status='completed'
       where owner_principal=$1 and status='active'`,[owner]);
    const {rowCount}=await client.query(
      `update public.billing_subscriptions
       set status='expired', updated_at=now()
       where owner_principal=$1 and id=$2::uuid and status='active'`,
      [owner,subscription.id]);
    if(rowCount!==1) {
      throw new SubscriptionLifecycleError("SUBSCRIPTION_CHANGED",
        "Subscription status changed concurrently.");
    }
    await client.query(
      `insert into public.billing_subscription_events
       (owner_principal,subscription_id,event_type)
       values($1,$2::uuid,'expired')`,[owner,subscription.id]);
    await client.query("COMMIT");
    return true;
  } catch(error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
