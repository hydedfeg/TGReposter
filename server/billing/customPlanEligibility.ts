import {getEffectivePlanId, type SubscriptionSnapshot} from "./planCatalog";

/**
 * Syntactic identity validation is never entitlement authorization.
 * Custom plans require BOTH a separately approved server rollout gate and a
 * database row that is enabled and published. The current database migration
 * additionally forbids publishing every custom tier.
 */
export const CUSTOM_PLAN_PATTERN=/^custom_[a-z][a-z0-9_]{2,29}$/;
export const CUSTOM_PLAN_CHECKOUT_SWITCH="TGREPOSTER_CUSTOM_TIER_CHECKOUT_ENABLED";
export const CUSTOM_PLAN_ENTITLEMENT_SWITCH="TGREPOSTER_CUSTOM_TIER_ENTITLEMENTS_ENABLED";
export const BUILTIN_PAID_PLAN_IDS=["creator","professional","business","agency"] as const;
type Query=(sql:string,params:unknown[])=>Promise<{rows:any[]}>;
type Environment=Record<string,string|undefined>;

export function isCustomPlanId(value:unknown):value is `custom_${string}` {
  return typeof value==="string" && CUSTOM_PLAN_PATTERN.test(value);
}
export function isPaidPlanCandidate(value:unknown,env:Environment=process.env):value is string {
  return (typeof value==="string" && BUILTIN_PAID_PLAN_IDS.some(id=>id===value)) ||
    (isCustomPlanId(value)&&env[CUSTOM_PLAN_CHECKOUT_SWITCH]==="true");
}
export const ELIGIBLE_CUSTOM_PLAN_SQL=`
  select id,is_published,is_enabled,monthly_eur_cents,annual_eur_cents
  from public.billing_plans where id=$1`;

/**
 * For built-in subscriptions preserve the established non-destructive
 * treatment of already-paid terms. For custom tiers, fail closed until an
 * approved published+enabled catalog row exists AND the new gate is on.
 * This remains dormant while the custom draft publication CHECK is present.
 */
export async function resolveEffectiveCatalogPlan(
  subscription:SubscriptionSnapshot|null,query:Query,
  at:Date=new Date(),env:Environment=process.env
):Promise<string> {
  const builtIn=getEffectivePlanId(subscription,at);
  if(builtIn!=="free" || !isCustomPlanId(subscription?.planId))return builtIn;
  if(env[CUSTOM_PLAN_ENTITLEMENT_SWITCH]!=="true")return "free";
  if(subscription?.status!=="active")return "free";
  const from=Date.parse(subscription.currentPeriodStart??"");
  const until=Date.parse(subscription.currentPeriodEnd??"");
  if(!Number.isFinite(from)||!Number.isFinite(until)||!Number.isFinite(at.getTime())||
      from>=until||from>at.getTime()||until<=at.getTime())return "free";
  const {rows}=await query(ELIGIBLE_CUSTOM_PLAN_SQL,[subscription.planId]);
  const plan=rows[0];
  if(rows.length!==1 || !plan || plan.id!==subscription.planId ||
     plan.is_published!==true || plan.is_enabled!==true ||
     !Number.isSafeInteger(Number(plan.monthly_eur_cents)) ||
     Number(plan.monthly_eur_cents)<=0 ||
     !Number.isSafeInteger(Number(plan.annual_eur_cents)) ||
     Number(plan.annual_eur_cents)<=0) return "free";
  return subscription.planId;
}
