import { getPostgresPool } from "../utils/postgresPool";
import { getEffectivePlanId, type PlanId, type SubscriptionSnapshot } from "./planCatalog";

/**
 * Read-only customer billing projection.
 * The caller must derive ownerPrincipal from the authenticated server session.
 * No direct table access is granted to browsers and no mutation occurs here.
 */
export interface BillingOverview {
  availability: "active" | "prelaunch";
  plan: {
    id: PlanId;
    name: string;
    published: boolean;
    monthlyEurCents: number | null;
    annualEurCents: number | null;
    limits: {
      users: number | null;
      sources: number | null;
      destinations: number | null;
      activeCampaigns: number | null;
      historyDays: number | null;
    };
    monthlyAiUnits: string | null;
    features: string[];
  };
  subscription: {
    status: string;
    interval: string;
    periodStart: string | null;
    periodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  usage: {
    sources: number;
    destinations: number;
    activeCampaigns: number;
    users: null; // Seat accounting needs a separate organization/team model.
  };
  ai: {
    includedAvailable: string;
    purchasedAvailable: string;
    includedGranted: string;
    periodEnd: string | null;
  };
  orders: Array<{
    id: string;
    type: "subscription" | "topup";
    description: string;
    status: string;
    paymentStatus: string;
    listedEurCents: number;
    createdAt: string;
  }>;
}

type Query = (sql: string, params: unknown[]) => Promise<{ rows: any[] }>;

const QUERY_SUBSCRIPTION = `
  select plan_id, status, billing_interval, current_period_start,
    current_period_end, cancel_at_period_end
  from public.billing_subscriptions where owner_principal=$1
`;

const QUERY_PLAN = `
  select id, display_name, is_published, monthly_eur_cents,
    annual_eur_cents, max_users, max_sources, max_destinations,
    max_active_campaigns, history_days, monthly_ai_units::text as monthly_ai_units
  from public.billing_plans where id=$1
`;

const QUERY_FEATURES = `
  select feature_code from public.billing_plan_features pf
  join public.billing_features f on f.code=pf.feature_code
  where pf.plan_id=$1 and f.release_state='available'
  order by pf.feature_code
`;

export const BILLING_USAGE_QUERY = `
  select
    (select count(*)::int from public.source_channels
      where owner_principal=$1 and enabled=true) as sources,
    (select count(*)::int from public.destination_targets
      where owner_principal=$1 and enabled=true) as destinations,
    (select count(*)::int from public.promotion_campaigns
      where owner_principal=$1 and status in ('ready','running')) as active_campaigns
`;

export const BILLING_AI_QUERY = `
  select
    coalesce(sum(units_delta) filter
      (where balance_type='included'
        and period_start<=now() and period_end>now()),0)::text as included_available,
    coalesce(sum(units_delta) filter
      (where balance_type='included' and event_kind='grant'
        and period_start<=now() and period_end>now()),0)::text as included_granted,
    coalesce(sum(units_delta) filter
      (where balance_type='purchased'),0)::text as purchased_available,
    max(period_end) filter
      (where balance_type='included'
        and period_start<=now() and period_end>now()) as included_period_end
  from public.ai_unit_ledger
  where owner_principal=$1
`;

export const BILLING_ORDERS_QUERY = `
  select * from (
    select o.id::text as id, 'subscription'::text as type,
      p.display_name || ' (' || o.billing_interval || ')' as description,
      o.status, i.status as payment_status, o.listed_eur_cents, o.created_at
    from public.billing_subscription_orders o
    join public.crypto_payment_invoices i
      on i.owner_principal=o.owner_principal and i.id=o.invoice_id
    join public.billing_plans p on p.id=o.plan_id
    where o.owner_principal=$1
    union all
    select o.id::text as id, 'topup'::text as type,
      p.label as description, o.status, i.status as payment_status,
      o.listed_eur_cents, o.created_at
    from public.billing_ai_topup_orders o
    join public.crypto_payment_invoices i
      on i.owner_principal=o.owner_principal and i.id=o.invoice_id
    join public.billing_ai_topup_packs p on p.id=o.pack_id
    where o.owner_principal=$1
  ) orders
  order by created_at desc, id desc
  limit 12
`;

export function normalizeBillingOwner(value: string): string {
  const owner = value.trim().toLowerCase();
  if (!/^(legacy|supabase):[^\s]{1,240}$/.test(owner)) {
    throw new Error("Valid authenticated billing owner is required.");
  }
  return owner;
}

const asIso = (value: unknown): string | null => {
  if (!value) return null;
  const date = new Date(value as string);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
};

const safeUnits = (value: unknown): string =>
  typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value) ? value : "0";

export async function getBillingOverview(
  ownerPrincipal: string,
  options: { query?: Query; now?: Date } = {}
): Promise<BillingOverview> {
  const owner = normalizeBillingOwner(ownerPrincipal);
  // Queries use $1=owner everywhere; never accept owner from request params.
  const query: Query = options.query ??
    ((sql, params) => getPostgresPool().query(sql, params));
  const at = options.now ?? new Date();
  const { rows: snapshots } = await query(QUERY_SUBSCRIPTION, [owner]);
  const snapshot = snapshots[0] ?? null;
  const effective: SubscriptionSnapshot | null = snapshot ? {
    planId: snapshot.plan_id,
    status: snapshot.status,
    currentPeriodStart: asIso(snapshot.current_period_start),
    currentPeriodEnd: asIso(snapshot.current_period_end),
  } : null;
  const planId = getEffectivePlanId(effective, at);
  const { rows: plans } = await query(QUERY_PLAN, [planId]);
  const p = plans[0];
  if (!p) throw new Error("Billing plan catalog is not installed.");

  const [features, usage, balance, orders] = await Promise.all([
    query(QUERY_FEATURES, [planId]),
    query(BILLING_USAGE_QUERY, [owner]),
    query(BILLING_AI_QUERY, [owner]),
    query(BILLING_ORDERS_QUERY, [owner])
  ]);
  const u = usage.rows[0] ?? {};
  const b = balance.rows[0] ?? {};
  return {
    availability: p.is_published ? "active" : "prelaunch",
    plan: {
      id: planId, name: p.display_name, published: p.is_published,
      monthlyEurCents: p.monthly_eur_cents, annualEurCents: p.annual_eur_cents,
      limits: {
        users: p.max_users, sources: p.max_sources,
        destinations: p.max_destinations, activeCampaigns: p.max_active_campaigns,
        historyDays: p.history_days
      },
      monthlyAiUnits: safeUnits(p.monthly_ai_units),
      features: features.rows.map((row) => row.feature_code)
    },
    subscription: snapshot ? {
      status: snapshot.status, interval: snapshot.billing_interval,
      periodStart: asIso(snapshot.current_period_start),
      periodEnd: asIso(snapshot.current_period_end),
      cancelAtPeriodEnd: Boolean(snapshot.cancel_at_period_end)
    } : null,
    usage: {
      sources: Number(u.sources ?? 0), destinations: Number(u.destinations ?? 0),
      activeCampaigns: Number(u.active_campaigns ?? 0), users: null
    },
    ai: {
      includedAvailable: safeUnits(b.included_available),
      purchasedAvailable: safeUnits(b.purchased_available),
      includedGranted: safeUnits(b.included_granted),
      periodEnd: asIso(b.included_period_end)
    },
    orders: orders.rows.map((row) => ({
      id: String(row.id), type: row.type, description: String(row.description),
      status: String(row.status), paymentStatus: String(row.payment_status),
      listedEurCents: Number(row.listed_eur_cents),
      createdAt: asIso(row.created_at) ?? ""
    }))
  };
}
