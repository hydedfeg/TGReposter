import { getPostgresPool } from "../utils/postgresPool";
import {isPaidPlanCandidate} from "./customPlanEligibility";
import { normalizeBillingOwner } from "./billingOverviewService";

/**
 * Phase 8: financially conservative subscription change PREVIEW.
 * This module never writes an order, changes a subscription, grants credits,
 * charges a card/wallet, or promises a refund.
 *
 * The policy is a DRAFT for commercial/legal approval, not a payment quote.
 */
export class PlanChangePreviewError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "PlanChangePreviewError";
  }
}

type Query = (sql: string, params: unknown[]) => Promise<{ rows: any[] }>;

export interface PlanChangePreview {
  kind: "non_binding_estimate";
  currency: "EUR";
  currentPlan: string;
  targetPlan: string;
  interval: "monthly" | "annual";
  direction: "upgrade" | "downgrade";
  effectiveAt: string;
  currentPeriodEnd: string;
  currentPeriodPriceCents: number;
  targetPeriodPriceCents: number;
  estimatedAdditionalCents: number;
  estimatedRefundCents: 0;
  remainingPeriodRatio: { remainingMs: number; totalMs: number };
  checkoutEnabled: false;
  policyStatus: "requires_approval";
}

export const PLAN_CHANGE_SNAPSHOT_SQL = `
  select plan_id,status,billing_interval,current_period_start,current_period_end,
    cancel_at_period_end
  from public.billing_subscriptions
  where owner_principal=$1
`;

export const PLAN_CHANGE_CATALOG_SQL = `
  select id,is_published,is_enabled,monthly_eur_cents,annual_eur_cents
  from public.billing_plans
  where id=$1 or id=$2
`;

export const PLAN_CHANGE_CONFLICT_SQL = `
  select
    exists(
      select 1 from public.billing_subscription_terms
      where owner_principal=$1 and status='scheduled'
    ) as prepaid_renewal,
    exists(
      select 1 from public.billing_subscription_orders o
      join public.crypto_payment_invoices i
        on i.owner_principal=o.owner_principal and i.id=o.invoice_id
      where o.owner_principal=$1 and o.status='pending'
        and i.status not in ('expired','canceled')
    ) as unresolved_payment
`;

function price(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new PlanChangePreviewError("INVALID_PLAN_PRICE",
      "A valid published catalog price is required.");
  }
  return value as number;
}

function asMs(value: unknown): number {
  if (!(value instanceof Date) && typeof value !== "string") {
    throw new PlanChangePreviewError("INVALID_TERM", "Billing period is invalid.");
  }
  const n = new Date(value).getTime();
  if (!Number.isFinite(n)) {
    throw new PlanChangePreviewError("INVALID_TERM", "Billing period is invalid.");
  }
  return n;
}

export function computePlanChangeEstimate(input: {
  currentPriceCents: number;
  targetPriceCents: number;
  periodStart: Date | string;
  periodEnd: Date | string;
  now: Date;
}): { direction: "upgrade" | "downgrade"; estimatedAdditionalCents: number;
      remainingPeriodRatio: { remainingMs: number; totalMs: number } } {
  const current=price(input.currentPriceCents);
  const target=price(input.targetPriceCents);
  const start=asMs(input.periodStart);
  const end=asMs(input.periodEnd);
  const now=input.now.getTime();
  if (!Number.isFinite(now) || start>=end || now<start || now>=end) {
    throw new PlanChangePreviewError("INVALID_TERM","No active paid term to estimate.");
  }
  if(current===target) {
    throw new PlanChangePreviewError("SAME_PRICE","Plans have the same price; manual review required.");
  }
  const total=BigInt(end-start);
  const remaining=BigInt(end-now);
  const difference=BigInt(Math.max(0,target-current));
  // Ceiling to nearest EUR cent. No silent underestimation in the preview.
  const additional=Number((difference*remaining + total-1n)/total);
  return {
    direction:target>current?"upgrade":"downgrade",
    estimatedAdditionalCents:additional,
    remainingPeriodRatio:{remainingMs:Number(remaining),totalMs:Number(total)}
  };
}

export async function getPlanChangePreview(
  ownerPrincipal:string,
  targetPlanId:string,
  options:{enabled?:boolean;query?:Query;now?:Date}={}
):Promise<PlanChangePreview> {
  if(options.enabled!==true && process.env.TGREPOSTER_PLAN_CHANGE_PREVIEW_ENABLED!=="true") {
    throw new PlanChangePreviewError("PREVIEW_DISABLED","Plan change preview is not launched.");
  }
  const owner=normalizeBillingOwner(ownerPrincipal);
  if(!isPaidPlanCandidate(targetPlanId)) {
    throw new PlanChangePreviewError("INVALID_TARGET_PLAN","Select a supported paid plan.");
  }
  const query:Query=options.query ?? ((sql,params)=>getPostgresPool().query(sql,params));
  const at=options.now ?? new Date();
  if (!Number.isFinite(at.getTime())) {
    throw new PlanChangePreviewError("INVALID_DATE","Invalid preview date.");
  }
  const {rows:snapshots}=await query(PLAN_CHANGE_SNAPSHOT_SQL,[owner]);
  const sub=snapshots[0];
  if (!sub || sub.status!=="active" || sub.cancel_at_period_end) {
    throw new PlanChangePreviewError("NO_ELIGIBLE_SUBSCRIPTION",
      "An active, non-canceling paid plan is required.");
  }
  const interval=sub.billing_interval;
  if (interval!=="monthly" && interval!=="annual") {
    throw new PlanChangePreviewError("UNSUPPORTED_INTERVAL","Unsupported billing interval.");
  }
  if (!isPaidPlanCandidate(sub.plan_id)
    || sub.plan_id===targetPlanId) {
    throw new PlanChangePreviewError("INVALID_CHANGE","Choose a different paid plan.");
  }
  const {rows:conflicts}=await query(PLAN_CHANGE_CONFLICT_SQL,[owner]);
  if(!conflicts.length || conflicts[0].prepaid_renewal || conflicts[0].unresolved_payment) {
    throw new PlanChangePreviewError("PAYMENT_REVIEW_REQUIRED",
      "Resolve prepaid renewals and outstanding payments before changing plans.");
  }
  const {rows:catalog}=await query(PLAN_CHANGE_CATALOG_SQL,[sub.plan_id,targetPlanId]);
  const current=catalog.find(row=>row.id===sub.plan_id);
  const target=catalog.find(row=>row.id===targetPlanId);
  if (!current?.is_published || !target?.is_published || current.is_enabled===false || target.is_enabled===false) {
    throw new PlanChangePreviewError("PLAN_NOT_PUBLISHED","Both plans must be published.");
  }
  const field=interval==="monthly"?"monthly_eur_cents":"annual_eur_cents";
  const currentPrice=price(current[field]);
  const targetPrice=price(target[field]);
  const estimate=computePlanChangeEstimate({
    currentPriceCents:currentPrice,targetPriceCents:targetPrice,
    periodStart:sub.current_period_start,periodEnd:sub.current_period_end,
    now:at
  });
  const end=new Date(asMs(sub.current_period_end)).toISOString();
  return {
    kind:"non_binding_estimate",currency:"EUR",
    currentPlan:sub.plan_id,targetPlan:targetPlanId,interval,
    direction:estimate.direction,
    effectiveAt:estimate.direction==="upgrade"?at.toISOString():end,
    currentPeriodEnd:end,currentPeriodPriceCents:currentPrice,
    targetPeriodPriceCents:targetPrice,
    estimatedAdditionalCents:estimate.estimatedAdditionalCents,
    estimatedRefundCents:0,
    remainingPeriodRatio:estimate.remainingPeriodRatio,
    checkoutEnabled:false,policyStatus:"requires_approval"
  };
}
