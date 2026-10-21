import { getPostgresPool } from "../utils/postgresPool";
import { normalizeBillingOwner } from "./billingOverviewService";
import { type SubscriptionSnapshot } from "./planCatalog";
import { resolveEffectiveCatalogPlan } from "./customPlanEligibility";

export type CapacityKind = "sources" | "destinations" | "activeCampaigns";

/** PostgreSQL raises a controlled SQLSTATE when a serialized write is over cap. */
export function isPlanCapacityDbError(error:unknown):boolean {
  return error!==null&&typeof error==="object"&&
    "code" in error&&(error as {code?:unknown}).code==="PZ409";
}
export const ENTITLEMENT_SWITCH = "TGREPOSTER_BACKEND_ENTITLEMENTS_ENFORCED";

export class PlanCapacityError extends Error {
  readonly code = "PLAN_LIMIT_REACHED";
  readonly status = 409;
  constructor(readonly kind:CapacityKind,readonly planId:string,readonly limit:number){
    super("Current subscription plan capacity reached.");
    this.name="PlanCapacityError";
  }
}
type Query=(sql:string,params:unknown[])=>Promise<{rows:any[]}>;

const SNAPSHOT_SQL = `
  select plan_id,status,current_period_start,current_period_end
  from public.billing_subscriptions where owner_principal=$1
`;
const LIMIT_SQL = `
  select max_sources,max_destinations,max_active_campaigns
  from public.billing_plans where id=$1
`;

export const PLAN_CAPACITY_USAGE_SQL = `
  select
    (select count(*)::int from public.source_channels
     where owner_principal=$1 and enabled=true) as sources,
    ((select count(*)::int from public.destination_targets
      where owner_principal=$1 and enabled=true)
     + (select count(*)::int from public.promotion_targets
       where owner_principal=$1 and enabled=true)) as destinations,
    (select count(*)::int from public.promotion_campaigns
     where owner_principal=$1 and status in ('ready','running')) as active_campaigns
`;

function dateString(value:unknown):string|null {
  if(value===null||value===undefined)return null;
  const d=new Date(value as string|Date);
  return Number.isFinite(d.getTime())?d.toISOString():null;
}

function nonNegativeLimit(value:unknown):number|null {
  if(value===null)return null; // Nullable Enterprise cap represents unlimited.
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<0)throw new Error("Invalid plan capacity.");
  return n;
}

/**
 * Disabled-by-default preflight to avoid breaking existing prelaunch accounts.
 * Not an atomic reservation: concurrent multi-replica writers need serializing
 * before the feature can be enabled for real commercial customers.
 */
export async function requirePlanCapacity(
  ownerPrincipal:string,kind:CapacityKind,additionalActive:number,
  options:{env?:Record<string,string|undefined>;query?:Query;at?:Date}={}
):Promise<void>{
  if((options.env??process.env)[ENTITLEMENT_SWITCH]!=="true")return;
  const owner=normalizeBillingOwner(ownerPrincipal);
  if(!["sources","destinations","activeCampaigns"].includes(kind) ||
     !Number.isSafeInteger(additionalActive)||additionalActive<0)
    throw new Error("Invalid entitlement request.");
  if(additionalActive===0)return;
  const query=options.query??((sql,args)=>getPostgresPool().query(sql,args));
  const snapshotRows=await query(SNAPSHOT_SQL,[owner]);
  const row=snapshotRows.rows[0]??null;
  const snapshot:SubscriptionSnapshot|null=row?{
    planId:String(row.plan_id),status:String(row.status),
    currentPeriodStart:dateString(row.current_period_start),
    currentPeriodEnd:dateString(row.current_period_end)
  }:null;
  const planId=await resolveEffectiveCatalogPlan(snapshot,query,options.at??new Date(),options.env??process.env);
  const plans=await query(LIMIT_SQL,[planId]);
  if(plans.rows.length!==1)throw new Error("Billing plan unavailable.");
  const cap=plans.rows[0];
  const limit=nonNegativeLimit(kind==="sources"?cap.max_sources:
    kind==="destinations"?cap.max_destinations:cap.max_active_campaigns);
  if(limit===null)return;
  const counts=await query(PLAN_CAPACITY_USAGE_SQL,[owner]);
  if(counts.rows.length!==1)throw new Error("Billing usage unavailable.");
  const used=Number(kind==="sources"?counts.rows[0].sources:
    kind==="destinations"?counts.rows[0].destinations:counts.rows[0].active_campaigns);
  if(!Number.isSafeInteger(used)||used<0)throw new Error("Invalid billing usage.");
  if(used+additionalActive>limit)throw new PlanCapacityError(kind,planId,limit);
}
