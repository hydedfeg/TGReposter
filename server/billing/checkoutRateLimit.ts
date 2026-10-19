import { getPostgresPool } from "../utils/postgresPool";
import { normalizeBillingOwner } from "./billingOverviewService";

export type CheckoutRateAction = "quote" | "invoice";
export const CHECKOUT_LIMITS: Record<CheckoutRateAction,{
  perMinute:number;perHour:number;
}> = {
  quote:{perMinute:6,perHour:30},
  invoice:{perMinute:3,perHour:12}
};
export const CHECKOUT_LIMITED_CODE="CHECKOUT_RATE_LIMITED";

export class CheckoutRateLimitError extends Error {
  readonly code=CHECKOUT_LIMITED_CODE;
  constructor(readonly retryAfterSeconds:number){
    super("Too many checkout requests. Please try again later.");
    this.name="CheckoutRateLimitError";
  }
}

type Query=(sql:string,args:unknown[])=>Promise<{rows:any[]}>;
const RUN_LIMIT_SQL=`
  insert into public.billing_checkout_rate_limits
    (owner_principal,action,minute_started_at,minute_hits,hour_started_at,hour_hits,updated_at)
  values ($1,$2,now(),1,now(),1,now())
  on conflict (owner_principal,action) do update set
    minute_started_at=case when billing_checkout_rate_limits.minute_started_at <= now()-interval '60 seconds'
      then now() else billing_checkout_rate_limits.minute_started_at end,
    minute_hits=case when billing_checkout_rate_limits.minute_started_at <= now()-interval '60 seconds'
      then 1 else billing_checkout_rate_limits.minute_hits+1 end,
    hour_started_at=case when billing_checkout_rate_limits.hour_started_at <= now()-interval '1 hour'
      then now() else billing_checkout_rate_limits.hour_started_at end,
    hour_hits=case when billing_checkout_rate_limits.hour_started_at <= now()-interval '1 hour'
      then 1 else billing_checkout_rate_limits.hour_hits+1 end,
    updated_at=now()
  where
    (billing_checkout_rate_limits.minute_started_at <= now()-interval '60 seconds'
      or billing_checkout_rate_limits.minute_hits < $3::integer)
    and
    (billing_checkout_rate_limits.hour_started_at <= now()-interval '1 hour'
      or billing_checkout_rate_limits.hour_hits < $4::integer)
  returning minute_hits,hour_hits
`;

const RETRY_QUERY=`
  select minute_hits,hour_hits,
    extract(epoch from minute_started_at + interval '60 seconds'-now()) as minute_left,
    extract(epoch from hour_started_at + interval '1 hour'-now()) as hour_left
  from public.billing_checkout_rate_limits
  where owner_principal=$1 and action=$2
`;

/**
 * Atomic Postgres UPSERT prevents concurrent requests or multiple instances
 * from bypassing owner-specific minute/hour limits. Use server database time,
 * never X-Forwarded-For or user-supplied account names.
 *
 * No checkout code runs if the database is unavailable: errors bubble into
 * the existing fail-closed 503 handler.
 */
export async function checkCustomerCheckoutRate(
  ownerPrincipal:string,
  action:CheckoutRateAction,
  options:{query?:Query}={}
):Promise<void>{
  const owner=normalizeBillingOwner(ownerPrincipal);
  if(action!=="quote" && action!=="invoice")
    throw new Error("Unknown internal checkout action.");
  const query=options.query??((sql,args)=>getPostgresPool().query(sql,args));
  const {perMinute,perHour}=CHECKOUT_LIMITS[action];
  const result=await query(RUN_LIMIT_SQL,[owner,action,perMinute,perHour]);
  if(result.rows.length)return;
  const blocked=await query(RETRY_QUERY,[owner,action]);
  const row=blocked.rows[0];
  const waitMinute=Number(row?.minute_hits)>=perMinute?
    Number(row?.minute_left):0;
  const waitHour=Number(row?.hour_hits)>=perHour?
    Number(row?.hour_left):0;
  const wait=Math.max(waitMinute,waitHour,1);
  // Retry-After is bounded even if database timestamps are unexpected.
  throw new CheckoutRateLimitError(
    Number.isFinite(wait)?Math.max(1,Math.min(3600,Math.ceil(wait))):60
  );
}
