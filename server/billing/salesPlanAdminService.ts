import type { PoolClient } from "pg";
import { getPostgresPool } from "../utils/postgresPool";
import { ownerPrincipalForUser, type AuthenticatedUserIdentity } from "../services/userPrincipalService";

// The initial admin editor deliberately manages the six established plans.
// The current subscription resolver and checkout allowlist are not ready for
// arbitrary new IDs; do not offer an unsafe Create Plan button before those
// dependent services are migrated to dynamic plan identities.
const EXISTING_IDS = new Set(["free","creator","professional","business","agency","enterprise"]);
type Client = Pick<PoolClient,"query"|"release">;
export type PlanAdminQuery = (sql:string,params?:unknown[]) => Promise<{rows:any[];rowCount?:number|null}>;

export class SalesPlanAdminError extends Error {
  constructor(public code:string, message:string) {
    super(message);
    this.name="SalesPlanAdminError";
  }
}
export interface SalesPlanEdit {
  revision:number;
  displayName:string;
  monthlyEurCents:number|null;
  annualEurCents:number|null;
  maxUsers:number|null;
  maxSources:number|null;
  maxDestinations:number|null;
  maxActiveCampaigns:number|null;
  historyDays:number|null;
  monthlyAiUnits:string|null;
  monitoringPriority:"low"|"standard"|"frequent"|"priority"|"custom";
  supportTier:"community"|"standard"|"priority"|"dedicated";
  isEnabled:boolean;
  featureCodes:string[];
}
export interface SalesPlanAdminOptions {
  clientFactory?:()=>Promise<Client>;
  query?:PlanAdminQuery;
}
export const SALES_PLAN_SELECT=`
  select id,display_name,sort_order,monthly_eur_cents,annual_eur_cents,
    max_users,max_sources,max_destinations,max_active_campaigns,
    history_days,monthly_ai_units::text as monthly_ai_units,
    monitoring_priority,support_tier,is_enabled,is_published,catalog_revision
  from public.billing_plans order by sort_order`;
export const SALES_FEATURE_SELECT=`
  select f.code,f.description,f.release_state,pf.plan_id
  from public.billing_features f
  left join public.billing_plan_features pf on pf.feature_code=f.code
  order by f.code,pf.plan_id`;

function asPlan(r:any) {
  return {
    id:String(r.id),
    displayName:String(r.display_name),
    sortOrder:Number(r.sort_order),
    monthlyEurCents:r.monthly_eur_cents===null?null:Number(r.monthly_eur_cents),
    annualEurCents:r.annual_eur_cents===null?null:Number(r.annual_eur_cents),
    maxUsers:r.max_users===null?null:Number(r.max_users),
    maxSources:r.max_sources===null?null:Number(r.max_sources),
    maxDestinations:r.max_destinations===null?null:Number(r.max_destinations),
    maxActiveCampaigns:r.max_active_campaigns===null?null:Number(r.max_active_campaigns),
    historyDays:r.history_days===null?null:Number(r.history_days),
    monthlyAiUnits:r.monthly_ai_units===null?null:String(r.monthly_ai_units),
    monitoringPriority:String(r.monitoring_priority),
    supportTier:String(r.support_tier),
    isEnabled:r.is_enabled===true,
    isPublished:r.is_published===true,
    revision:Number(r.catalog_revision)
  };
}

export async function listSalesPlanCatalog(options:SalesPlanAdminOptions={}) {
  const query=options.query??((sql:string,params:unknown[]=[])=>getPostgresPool().query(sql,params));
  const [plans,features]=await Promise.all([
    query(SALES_PLAN_SELECT),query(SALES_FEATURE_SELECT)
  ]);
  const codes=new Map<string,string[]>();
  const featureRows=new Map<string,{code:string;description:string;releaseState:string}>();
  for(const row of features.rows){
    const code=String(row.code);
    featureRows.set(code,{code,description:String(row.description),releaseState:String(row.release_state)});
    if(row.plan_id){
      const p=String(row.plan_id);
      codes.set(p,[...(codes.get(p)??[]),code]);
    }
  }
  return {
    plans:plans.rows.map(p=>({...asPlan(p),featureCodes:codes.get(String(p.id))??[]})),
    features:Array.from(featureRows.values()),
    editorEnabled:process.env.TGREPOSTER_SALES_PLAN_EDITOR_ENABLED==="true",
    publicationEnabled:false,
    newTierCreationEnabled:false
  };
}

function invalid(message:string):never {
  throw new SalesPlanAdminError("INVALID_PLAN_INPUT",message);
}
const EDIT_KEYS=[
  "revision","displayName","monthlyEurCents","annualEurCents","maxUsers",
  "maxSources","maxDestinations","maxActiveCampaigns","historyDays",
  "monthlyAiUnits","monitoringPriority","supportTier","isEnabled","featureCodes"
] as const;

function intBound(value:unknown, max:number, nullable:boolean):number|null {
  if(value===null && nullable)return null;
  if(typeof value!=="number" || !Number.isSafeInteger(value) || value<0 || value>max)
    invalid("Plan limits and prices must be non-negative bounded integers.");
  return value as number;
}
function validate(planId:string,raw:unknown):SalesPlanEdit {
  if(!EXISTING_IDS.has(planId))throw new SalesPlanAdminError("UNKNOWN_PLAN","Unknown subscription plan.");
  if(!raw || typeof raw!=="object" || Array.isArray(raw))invalid("Invalid plan edit.");
  const obj=raw as Record<string,unknown>;
  if(Object.keys(obj).length!==EDIT_KEYS.length ||
    EDIT_KEYS.some(key=>!Object.hasOwn(obj,key)))invalid("Plan edit must include only the supported fields.");
  if(!Number.isSafeInteger(obj.revision) || Number(obj.revision)<1)invalid("Plan revision is required.");
  if(typeof obj.displayName!=="string" || obj.displayName.trim().length<2 ||
     obj.displayName.trim().length>70)invalid("Enter a plan name between 2 and 70 characters.");
  if(typeof obj.isEnabled!=="boolean")invalid("Plan enablement must be true or false.");
  const priority=["low","standard","frequent","priority","custom"] as const;
  const support=["community","standard","priority","dedicated"] as const;
  if(!priority.includes(obj.monitoringPriority as typeof priority[number]) ||
    !support.includes(obj.supportTier as typeof support[number]))invalid("Unsupported priority or support tier.");
  if(!Array.isArray(obj.featureCodes) || obj.featureCodes.length>40 ||
    obj.featureCodes.some(x=>typeof x!=="string" || !/^[a-z][a-z0-9_]{1,49}$/.test(x)) ||
    new Set(obj.featureCodes).size!==obj.featureCodes.length)invalid("Invalid feature assignments.");
  const custom=planId==="enterprise";
  const free=planId==="free";
  const monthly=intBound(obj.monthlyEurCents,1000000000,custom);
  const annual=intBound(obj.annualEurCents,1000000000,custom);
  if(custom ? monthly!==null||annual!==null : free ? monthly!==0||annual!==0 : monthly===null||annual===null||monthly<1||annual<1)
    invalid("Subscription price is incompatible with its plan type.");
  const users=intBound(obj.maxUsers,1000000,custom);
  const sources=intBound(obj.maxSources,1000000,custom);
  const destinations=intBound(obj.maxDestinations,1000000,custom);
  const campaigns=intBound(obj.maxActiveCampaigns,1000000,custom);
  const days=intBound(obj.historyDays,36500,custom);
  if(!custom && (users===null||users<1||days===null||days<1))
    invalid("User and retention limits must be positive.");
  const units=obj.monthlyAiUnits;
  if(custom ? units!==null :
    typeof units!=="string" || !/^\d{1,12}(?:\.\d{1,6})?$/.test(units) ||
    Number(units)>1000000000)invalid("Invalid monthly AI Unit allowance.");
  return {
    revision:Number(obj.revision),
    displayName:(obj.displayName as string).trim(),monthlyEurCents:monthly,annualEurCents:annual,
    maxUsers:users,maxSources:sources,maxDestinations:destinations,
    maxActiveCampaigns:campaigns,historyDays:days,monthlyAiUnits:units as string|null,
    monitoringPriority:obj.monitoringPriority as SalesPlanEdit["monitoringPriority"],
    supportTier:obj.supportTier as SalesPlanEdit["supportTier"],
    isEnabled:obj.isEnabled as boolean,featureCodes:obj.featureCodes as string[]
  };
}

export async function saveDraftSalesPlan(
  planId:string,edit:unknown,actor:AuthenticatedUserIdentity,
  options:SalesPlanAdminOptions={}
) {
  if(process.env.TGREPOSTER_SALES_PLAN_EDITOR_ENABLED!=="true")
    throw new SalesPlanAdminError("PLAN_EDITOR_DISABLED","Sales Plan editing is disabled.");
  const input=validate(planId,edit);
  const principal=ownerPrincipalForUser(actor);
  const client=await (options.clientFactory??(()=>getPostgresPool().connect()))();
  try{
    await client.query("BEGIN");
    const old=await client.query(
      SALES_PLAN_SELECT.replace("order by sort_order","where id=$1 for update"),[planId]);
    if(!old.rows[0])throw new SalesPlanAdminError("UNKNOWN_PLAN","Plan was not found.");
    const before=asPlan(old.rows[0]);
    if(before.revision!==input.revision)
      throw new SalesPlanAdminError("PLAN_EDIT_CONFLICT","Plan has changed. Refresh before editing.");
    if(before.isPublished)
      throw new SalesPlanAdminError("PUBLISHED_PLAN_LOCKED","Published plans require a separately approved migration.");
    const {rows:subscriptions}=await client.query(
      "select count(*)::int as n from public.billing_subscriptions where plan_id=$1 and status in ('active','past_due','paused')",[planId]);
    if(Number(subscriptions[0]?.n)>0)
      throw new SalesPlanAdminError("EXISTING_ENTITLEMENTS","Plans with active subscriptions require a financial migration.");
    const {rows:knownFeatures}=await client.query(
      "select code from public.billing_features where code=any($1::text[])",[input.featureCodes]);
    if(knownFeatures.length!==input.featureCodes.length)
      throw new SalesPlanAdminError("UNKNOWN_FEATURE","One or more feature codes are not registered.");
    const previousFeatures=await client.query(
      "select feature_code from public.billing_plan_features where plan_id=$1 order by feature_code",[planId]);
    const updated=await client.query(
      `update public.billing_plans set
        display_name=$3,monthly_eur_cents=$4,annual_eur_cents=$5,
        max_users=$6,max_sources=$7,max_destinations=$8,max_active_campaigns=$9,
        history_days=$10,monthly_ai_units=$11::numeric,monitoring_priority=$12,
        support_tier=$13,is_enabled=$14,catalog_revision=catalog_revision+1,
        updated_at=now()
        where id=$1 and catalog_revision=$2 and is_published=false
        returning *`,
      [planId,input.revision,input.displayName,input.monthlyEurCents,input.annualEurCents,
       input.maxUsers,input.maxSources,input.maxDestinations,input.maxActiveCampaigns,
       input.historyDays,input.monthlyAiUnits,input.monitoringPriority,input.supportTier,input.isEnabled]);
    if(updated.rows.length!==1)
      throw new SalesPlanAdminError("PLAN_EDIT_CONFLICT","Plan changed during editing.");
    await client.query("delete from public.billing_plan_features where plan_id=$1",[planId]);
    if(input.featureCodes.length)await client.query(
      `insert into public.billing_plan_features (plan_id,feature_code)
       select $1,unnest($2::text[])`,[planId,input.featureCodes]);
    const next=asPlan(updated.rows[0]);
    // JSONB here is ONLY the immutable audit snapshot, not the canonical config.
    await client.query(
      `insert into public.billing_plan_change_events
        (plan_id,actor_principal,previous_revision,new_revision,previous_state,new_state)
       values ($1,$2,$3,$4,$5::jsonb,$6::jsonb)`,
      [planId,principal,input.revision,next.revision,
       JSON.stringify({...before,featureCodes:previousFeatures.rows.map(x=>String(x.feature_code))}),
       JSON.stringify({...next,featureCodes:input.featureCodes})]);
    await client.query("COMMIT");
    return {...next,featureCodes:input.featureCodes};
  }catch(error){
    await client.query("ROLLBACK");
    throw error;
  }finally{client.release();}
}
