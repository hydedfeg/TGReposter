/**
 * Commercial AI allowance grants. Not connected to live API routes.
 *
 * All identities, timestamps and plan decisions are backend-derived.
 * Plan activation and automatic grants require explicit launch enablement.
 */
import { getPostgresPool } from "../utils/postgresPool";
import { getEffectivePlanId, type SubscriptionSnapshot } from "./planCatalog";

export class AIGrantError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "AIGrantError";
  }
}

export interface AIAllowancePeriod {
  start: string;
  end: string;
}

export interface AIGrantResult {
  planId: string;
  period: AIAllowancePeriod;
  units: string;
  granted: boolean;
}

function ownerKey(value: string): string {
  const owner = value.trim().toLowerCase();
  if (!owner || owner.length > 255) throw new AIGrantError("INVALID_OWNER", "Invalid billing owner.");
  return owner;
}

function validDate(value: string | null): Date {
  const time = Date.parse(value ?? "");
  if (!Number.isFinite(time)) throw new AIGrantError("INVALID_PERIOD", "Billing period is invalid.");
  return new Date(time);
}

/** Calendar-aligned, UTC month anniversary with day-of-month clamping. */
export function addUtcMonths(anchor: Date, months: number): Date {
  if (!Number.isSafeInteger(months) || months < 0 || months > 24 || !Number.isFinite(anchor.getTime())) {
    throw new AIGrantError("INVALID_MONTH", "Invalid calendar month offset.");
  }
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth() + months;
  const first = new Date(Date.UTC(year, month, 1, anchor.getUTCHours(),
    anchor.getUTCMinutes(), anchor.getUTCSeconds(), anchor.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(anchor.getUTCDate(), lastDay));
  return first;
}

/**
 * Monthly invoices already carry the exact period boundaries.
 * Annual billing splits each paid period into monthly windows anchored at
 * its original start; units never roll over to subsequent windows.
 */
export function paidAllowancePeriod(
  startISO: string,
  endISO: string,
  interval: string,
  at: Date
): AIAllowancePeriod {
  const start = validDate(startISO);
  const end = validDate(endISO);
  if (!(start <= at && at < end) || !(start < end)) {
    throw new AIGrantError("INACTIVE_PERIOD", "No current paid billing period.");
  }
  if (interval === "monthly") {
    return { start: start.toISOString(), end: end.toISOString() };
  }
  if (interval !== "annual") {
    throw new AIGrantError("UNSUPPORTED_INTERVAL", "Unsupported AI allowance interval.");
  }
  for (let month = 0; month < 12; month++) {
    const from = addUtcMonths(start, month);
    const next = addUtcMonths(start, month + 1);
    const to = new Date(Math.min(next.getTime(), end.getTime()));
    if (from <= at && at < to) {
      return { start: from.toISOString(), end: to.toISOString() };
    }
  }
  throw new AIGrantError("INVALID_ANNUAL_PERIOD", "Annual billing period exceeds supported allowance windows.");
}

export function freeAllowancePeriod(at: Date): AIAllowancePeriod {
  if (!Number.isFinite(at.getTime())) throw new AIGrantError("INVALID_DATE", "Invalid current date.");
  const start = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
  return { start: start.toISOString(), end: addUtcMonths(start, 1).toISOString() };
}

interface SubscriptionDBRow {
  id: string;
  plan_id: string;
  billing_interval: string;
  status: string;
  current_period_start: string | Date | null;
  current_period_end: string | Date | null;
}

function asIso(value: string | Date | null): string | null {
  if (value instanceof Date) return value.toISOString();
  return value;
}

/**
 * Allocates at most once for the current owner/time window. On a mid-cycle
 * plan change, overlaps are explicitly rejected rather than awarding a
 * second complete monthly allowance. Upgrade deltas belong in a later step.
 */
export async function ensureMonthlyAIAllowance(
  ownerPrincipal: string,
  options: { enabled?: boolean; at?: Date } = {}
): Promise<AIGrantResult> {
  if (options.enabled !== true && process.env.TGREPOSTER_COMMERCIAL_AI_ENABLED !== "true") {
    throw new AIGrantError("NOT_LAUNCHED", "Commercial AI allowance allocation is disabled.");
  }
  const owner = ownerKey(ownerPrincipal);
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",
      [`tgreposter:ai-balance:${owner}`]);

    // Time defaults to Postgres clock. Controlled injection is only for tests.
    const clock = options.at ?? (await client.query("select now() as now")).rows[0].now as Date;
    const now = clock instanceof Date ? clock : new Date(clock);
    if (!Number.isFinite(now.getTime())) throw new AIGrantError("INVALID_DATE", "Invalid billing clock.");

    const { rows: subscriptions } = await client.query<SubscriptionDBRow>(
      `select id,plan_id,billing_interval,status,current_period_start,current_period_end
       from public.billing_subscriptions where owner_principal=$1 for update`, [owner]);
    const subscription = subscriptions[0] ?? null;
    const snapshot: SubscriptionSnapshot | null = subscription
      ? { planId: subscription.plan_id, status: subscription.status,
        currentPeriodStart: asIso(subscription.current_period_start),
        currentPeriodEnd: asIso(subscription.current_period_end) }
      : null;
    const planId = getEffectivePlanId(snapshot, now);
    const { rows: plans } = await client.query<{ monthly_ai_units: string | null; is_published: boolean }>(
      `select monthly_ai_units::text,is_published from public.billing_plans where id=$1`,[planId]);
    if (!plans[0]?.is_published || plans[0].monthly_ai_units === null) {
      throw new AIGrantError("PLAN_NOT_AVAILABLE", "This plan has no launched AI allowance.");
    }

    const period = planId !== "free" && subscription
      ? paidAllowancePeriod(
        asIso(subscription.current_period_start)!,
        asIso(subscription.current_period_end)!,
        subscription.billing_interval, now)
      : freeAllowancePeriod(now);
    const { rows: overlapping } = await client.query<{
      id: string;
      period_start: string | Date;
      period_end: string | Date;
      units_delta: string;
    }>(
      `select id,period_start,period_end,units_delta::text
       from public.ai_unit_ledger
       where owner_principal=$1 and balance_type='included' and event_kind='grant'
         and period_start < $3::timestamptz and period_end > $2::timestamptz
       order by created_at asc for update`,
      [owner,period.start,period.end]);

    if (overlapping.length) {
      const prior = overlapping[0];
      if (overlapping.length !== 1
        || asIso(prior.period_start) !== period.start
        || asIso(prior.period_end) !== period.end) {
        throw new AIGrantError("OVERLAPPING_ALLOWANCE", "An existing AI allowance overlaps this billing period.");
      }
      await client.query("COMMIT");
      return { planId,period,units:prior.units_delta,granted:false };
    }

    const key = `monthly-grant:${period.start}`;
    await client.query(
      `insert into public.ai_unit_ledger
       (owner_principal,event_key,balance_type,event_kind,units_delta,
        period_start,period_end,reference)
       values($1,$2,'included','grant',$3::numeric,$4::timestamptz,$5::timestamptz,$6)`,
      [owner,key,plans[0].monthly_ai_units,period.start,period.end,`plan:${planId}`]
    );
    await client.query("COMMIT");
    return { planId,period,units:plans[0].monthly_ai_units,granted:true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
