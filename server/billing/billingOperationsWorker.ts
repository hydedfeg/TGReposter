import { getPostgresPool } from "../utils/postgresPool";
import {
  fulfillVerifiedSubscription,
  activateDueSubscriptionTerm,
} from "./subscriptionCheckoutService";
import { fulfillVerifiedTopup } from "./aiTopupService";
import { ensureMonthlyAIAllowance } from "./monthlyAIAllowance";
import { noteBillingOperationFailure, clearBillingOperationFailure } from "./billingOperationsRetry";

/**
 * The billing operator is an INTERNAL Railway process, never an HTTP endpoint.
 *
 * It does not scan chains or decide whether a transaction is paid. Existing
 * payment watcher verifies transactions first, then these services validate
 * the confirmed invoice/transfer again before granting anything.
 *
 * The worker has three independent launch switches:
 * - TGREPOSTER_BILLING_WORKER_ENABLED
 * - TGREPOSTER_SUBSCRIPTION_CHECKOUT_ENABLED (subscription operations)
 * - TGREPOSTER_COMMERCIAL_TOPUPS_ENABLED (top-up grants)
 * - TGREPOSTER_COMMERCIAL_AI_ENABLED (monthly allowances)
 *
 * All flags default to OFF. A separate scheduler handles timing/DB locks.
 */

export const DEFAULT_BILLING_BATCH_SIZE = 25;
export const MAX_BILLING_BATCH_SIZE = 50;

export type BillingStage =
  | "subscriptions"
  | "topups"
  | "renewals"
  | "allowances";

export interface BillingCandidate {
  owner_principal: string;
  id: string;
}

export interface BillingBatchResult {
  enabled: boolean;
  stages: Record<BillingStage, {
    attempted: number;
    completed: number;
    failed: number;
  }>;
  failureCodes: Array<{ stage: BillingStage; code: string }>;
}

type Environment = Record<string, string | undefined>;
type CandidateList = (stage: BillingStage, limit: number) => Promise<BillingCandidate[]>;

export interface BillingBatchDependencies {
  env?: Environment;
  batchSize?: number;
  listCandidates?: CandidateList;
  fulfillSubscription?: typeof fulfillVerifiedSubscription;
  fulfillTopup?: typeof fulfillVerifiedTopup;
  activateRenewal?: typeof activateDueSubscriptionTerm;
  grantAllowance?: typeof ensureMonthlyAIAllowance;
  noteFailure?: typeof noteBillingOperationFailure;
  clearFailure?: typeof clearBillingOperationFailure;
}

const STAGES: BillingStage[] = [
  "subscriptions", "topups", "renewals", "allowances"
];

export function isBillingWorkerEnabled(env: Environment = process.env): boolean {
  return env.TGREPOSTER_BILLING_WORKER_ENABLED === "true"
    && env.TGREPOSTER_SUBSCRIPTION_CHECKOUT_ENABLED === "true";
}

export function parseBillingBatchSize(raw?: string): number {
  const batchSize = raw === undefined || raw.trim() === ""
    ? DEFAULT_BILLING_BATCH_SIZE : Number(raw);
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > MAX_BILLING_BATCH_SIZE) {
    throw new Error(`Billing batch size must be between 1 and ${MAX_BILLING_BATCH_SIZE}.`);
  }
  return batchSize;
}

export const BILLING_CANDIDATE_QUERIES: Record<BillingStage, string> = {
  subscriptions: `
    select o.owner_principal, o.id::text as id
    from public.billing_subscription_orders o
    join public.crypto_payment_invoices i
      on i.owner_principal=o.owner_principal and i.id=o.invoice_id
    join public.billing_plans p on p.id=o.plan_id
    where o.status='pending' and i.status='paid'
      and i.confirmed_at is not null and p.is_published
      and not exists (
        select 1 from public.billing_operation_attempts a
        where a.stage='subscriptions' and a.owner_principal=o.owner_principal
          and a.item_id=o.id and a.next_retry_at>now()
      )
    order by o.created_at asc, o.id asc limit $1
  `,
  topups: `
    select o.owner_principal, o.id::text as id
    from public.billing_ai_topup_orders o
    join public.crypto_payment_invoices i
      on i.owner_principal=o.owner_principal and i.id=o.invoice_id
    join public.billing_ai_topup_packs p on p.id=o.pack_id
    where o.status='pending' and i.status='paid'
      and i.confirmed_at is not null and p.is_published
      and not exists (
        select 1 from public.billing_operation_attempts a
        where a.stage='topups' and a.owner_principal=o.owner_principal
          and a.item_id=o.id and a.next_retry_at>now()
      )
    order by o.created_at asc, o.id asc limit $1
  `,
  renewals: `
    select t.owner_principal, t.id::text as id
    from public.billing_subscription_terms t
    join public.billing_plans p on p.id=t.plan_id
    where t.status='scheduled'
      and t.term_start <= now() and t.term_end > now()
      and p.is_published
      and not exists (
        select 1 from public.billing_operation_attempts a
        where a.stage='renewals' and a.owner_principal=t.owner_principal
          and a.item_id=t.id and a.next_retry_at>now()
      )
    order by t.term_start asc, t.id asc limit $1
  `,
  allowances: `
    select s.owner_principal, s.id::text as id
    from public.billing_subscriptions s
    join public.billing_plans p on p.id=s.plan_id
    where s.status='active' and p.is_published
      and s.plan_id <> 'free'
      and s.current_period_start <= now() and s.current_period_end > now()
      and not exists (
        select 1 from public.ai_unit_ledger l
        where l.owner_principal=s.owner_principal
          and l.balance_type='included' and l.event_kind='grant'
          and l.period_start <= now() and l.period_end > now()
      )
      and not exists (
        select 1 from public.billing_operation_attempts a
        where a.stage='allowances' and a.owner_principal=s.owner_principal
          and a.item_id=s.id and a.next_retry_at>now()
      )
    order by s.current_period_end asc, s.id asc limit $1
  `
};

export async function listBillingCandidates(
  stage: BillingStage,
  limit: number
): Promise<BillingCandidate[]> {
  const result = await getPostgresPool().query<BillingCandidate>(
    BILLING_CANDIDATE_QUERIES[stage], [limit]
  );
  return result.rows;
}

/**
 * Each candidate is handled independently. If one invoice has malformed or
 * disputed settlement, other customers continue. All grant operations are
 * internally atomic and idempotent; failures remain pending for later review.
 *
 * Candidate lists are loaded sequentially: an activated subscription or
 * renewal can receive an allowance in the SAME iteration.
 *
 * Free allocations are intentionally NOT swept by this worker. They must be
 * allocated lazily after a verified account action to avoid billing inactive
 * Free users for AI they never requested.
 */
export async function runBillingOperationsBatch(
  dependencies: BillingBatchDependencies = {}
): Promise<BillingBatchResult> {
  const env = dependencies.env ?? process.env;
  const stages = Object.fromEntries(STAGES.map(stage => [
    stage, { attempted: 0, completed: 0, failed: 0 }
  ])) as BillingBatchResult["stages"];
  const report: BillingBatchResult = {
    enabled: false, stages, failureCodes: []
  };
  if (!isBillingWorkerEnabled(env)) return report;

  const size = dependencies.batchSize ??
    parseBillingBatchSize(env.TGREPOSTER_BILLING_BATCH_SIZE);
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_BILLING_BATCH_SIZE) {
    throw new Error("Invalid billing batch size.");
  }
  const list = dependencies.listCandidates ?? listBillingCandidates;
  const fulfillSubscription = dependencies.fulfillSubscription ?? fulfillVerifiedSubscription;
  const fulfillTopup = dependencies.fulfillTopup ?? fulfillVerifiedTopup;
  const activate = dependencies.activateRenewal ?? activateDueSubscriptionTerm;
  const grant = dependencies.grantAllowance ?? ensureMonthlyAIAllowance;
  const noteFailure = dependencies.noteFailure ?? noteBillingOperationFailure;
  const clearFailure = dependencies.clearFailure ?? clearBillingOperationFailure;
  report.enabled = true;

  for (const stage of STAGES) {
    if (stage === "topups" && env.TGREPOSTER_COMMERCIAL_TOPUPS_ENABLED !== "true") continue;
    if (stage === "allowances" && env.TGREPOSTER_COMMERCIAL_AI_ENABLED !== "true") continue;
    const candidates = await list(stage, size);
    for (const candidate of candidates) {
      stages[stage].attempted += 1;
      try {
        // The owner always comes from a server-side DB query; no client
        // can supply an owner or payment confirmation to this worker.
        if (stage === "subscriptions") {
          await fulfillSubscription(candidate.owner_principal, candidate.id);
        } else if (stage === "topups") {
          await fulfillTopup(candidate.owner_principal, candidate.id);
        } else if (stage === "renewals") {
          const activated = await activate(candidate.owner_principal);
          if (!activated) {
            await clearFailure(stage,candidate);
            continue; // already advanced by another worker
          }
        } else {
          await grant(candidate.owner_principal);
        }
        stages[stage].completed += 1;
        try {
          await clearFailure(stage,candidate);
        } catch {
          // Fulfillment already committed: a failure to clear stale retry
          // metadata must not turn a successful payment into a failed charge.
          report.failureCodes.push({stage,code:"RETRY_CLEANUP_FAILED"});
        }
      } catch (error) {
        stages[stage].failed += 1;
        const code = (error && typeof error === "object" && "code" in error
          && typeof error.code === "string")
          ? error.code : "UNEXPECTED_ERROR";
        // Deliberately omit tenant IDs, addresses and invoice amounts
        // from metrics and logs.
        report.failureCodes.push({ stage, code: code.slice(0, 64) });
        try {
          await noteFailure(stage,candidate,code);
        } catch {
          // A transient retry-write problem must be visible, not swallowed.
          report.failureCodes.push({stage,code:"RETRY_RECORD_FAILED"});
        }
      }
    }
  }

  return report;
}
