/**
 * Commercial plan identity and lifecycle rules.
 *
 * The Postgres billing_plans table is the only source of plan prices/limits.
 * This module intentionally does not duplicate the plan allowances.
 * No current API route calls this resolver yet: billing is not activated.
 */
export const PLAN_IDS = [
  "free",
  "creator",
  "professional",
  "business",
  "agency",
  "enterprise",
] as const;

export type PlanId = (typeof PLAN_IDS)[number];
export type SubscriptionStatus =
  | "incomplete"
  | "active"
  | "past_due"
  | "paused"
  | "canceled"
  | "expired";

export interface SubscriptionSnapshot {
  planId: string;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
}

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && PLAN_IDS.some((id) => id === value);
}

/**
 * Fail closed for expired, inactive, malformed, or absent subscriptions.
 * A real billing system may later implement explicit past-due grace periods.
 *
 * All accounts are Free by default; no subscription row is required.
 */
export function getEffectivePlanId(
  subscription: SubscriptionSnapshot | null,
  at: Date = new Date()
): PlanId {
  if (!subscription || !isPlanId(subscription.planId)) return "free";
  if (subscription.planId === "free") return "free";
  if (subscription.status !== "active") return "free";

  const from = Date.parse(subscription.currentPeriodStart ?? "");
  const until = Date.parse(subscription.currentPeriodEnd ?? "");
  const now = at.getTime();
  if (![from, until, now].every(Number.isFinite)) return "free";
  if (from > now || until <= now || from >= until) return "free";

  return subscription.planId;
}
