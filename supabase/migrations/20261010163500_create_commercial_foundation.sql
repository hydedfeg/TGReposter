-- Phase 1: commercial data foundation for TGReposter.
-- Non-activating: no existing user is enrolled, billed or restricted by this migration.
-- Tenant keys follow the existing server-derived owner_principal model (legacy: / supabase:).
-- Catalog prices and allowances are a launch hypothesis; published=false prevents accidental sales.

create table public.billing_plans (
  id text primary key,
  display_name text not null,
  sort_order integer not null unique,
  monthly_eur_cents integer,
  annual_eur_cents integer,
  max_users integer,
  max_sources integer,
  max_destinations integer,
  max_active_campaigns integer,
  history_days integer,
  monthly_ai_units numeric(18, 6),
  monitoring_priority text not null,
  support_tier text not null,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_plans_id_check check (id in ('free','creator','professional','business','agency','enterprise')),
  constraint billing_plans_prices_check check (
    (id = 'enterprise' and monthly_eur_cents is null and annual_eur_cents is null)
    or (id = 'free' and monthly_eur_cents = 0 and annual_eur_cents = 0)
    or (id not in ('free','enterprise') and monthly_eur_cents > 0 and annual_eur_cents > 0)
  ),
  constraint billing_plans_limits_check check (
    (id = 'enterprise' and max_users is null and max_sources is null
      and max_destinations is null and max_active_campaigns is null
      and history_days is null and monthly_ai_units is null)
    or (id <> 'enterprise' and max_users > 0 and max_sources >= 0
      and max_destinations >= 0 and max_active_campaigns >= 0
      and history_days > 0 and monthly_ai_units >= 0)
  ),
  constraint billing_plans_priority_check check (
    monitoring_priority in ('low','standard','frequent','priority','custom')
  ),
  constraint billing_plans_support_check check (
    support_tier in ('community','standard','priority','dedicated')
  )
);

insert into public.billing_plans (
  id, display_name, sort_order, monthly_eur_cents, annual_eur_cents,
  max_users, max_sources, max_destinations, max_active_campaigns,
  history_days, monthly_ai_units, monitoring_priority, support_tier
) values
  ('free',         'Free',          0,     0,      0,  1,    3,   1,   0,    7,    10, 'low',      'community'),
  ('creator',      'Creator',       1,  1500,  15000,  1,   15,   3,   1,   90,   100, 'standard', 'standard'),
  ('professional', 'Professional',  2,  3900,  39000,  3,   75,  15,  10,  365,   400, 'frequent', 'standard'),
  ('business',     'Business',      3,  8900,  89000, 10,  250,  50,  50,  730,  1000, 'priority', 'priority'),
  ('agency',       'Agency',        4, 19900, 199000, 30, 1000, 200, 200, 1095,  2500, 'priority', 'priority'),
  ('enterprise',   'Enterprise',    5,  null,   null, null, null, null, null, null, null, 'custom', 'dedicated');

-- Keep feature availability distinct from plan entitlement, so unreleased roadmap
-- features can be designed without being advertised or enabled by mistake.
create table public.billing_features (
  code text primary key,
  release_state text not null default 'planned',
  description text not null,
  constraint billing_features_code_check check (code ~ '^[a-z][a-z0-9_]*$'),
  constraint billing_features_release_check check (release_state in ('available','planned','retired'))
);

insert into public.billing_features (code, release_state, description) values
  ('content_inbox','available','Owner-scoped content review inbox'),
  ('basic_filters','available','Basic source filtering'),
  ('full_filters','available','Advanced keyword and hashtag filtering'),
  ('ai_processing','available','OpenRouter AI transformation allowance'),
  ('ai_translation','available','AI translation'),
  ('multi_destination','available','Publishing to multiple destinations'),
  ('promotion_campaigns','available','Promotion campaign module'),
  ('scheduled_publishing','planned','Scheduled content publication'),
  ('automation_rules','planned','Automated curation and publishing rules'),
  ('advanced_analytics','planned','Advanced performance analytics'),
  ('approval_workflows','planned','Multi-step editorial approvals'),
  ('client_workspaces','planned','Agency client workspace isolation'),
  ('api_webhooks','planned','Customer API and webhooks');

create table public.billing_plan_features (
  plan_id text not null references public.billing_plans(id) on delete cascade,
  feature_code text not null references public.billing_features(code) on delete restrict,
  primary key (plan_id, feature_code)
);

insert into public.billing_plan_features (plan_id, feature_code)
select p.id, f.code
from public.billing_plans p
cross join public.billing_features f
where
     f.code in ('content_inbox','basic_filters','ai_processing')
  or (p.id <> 'free' and f.code in ('full_filters','ai_translation','multi_destination','promotion_campaigns'))
  or (p.id in ('creator','professional','business','agency','enterprise')
      and f.code = 'scheduled_publishing')
  or (p.id in ('professional','business','agency','enterprise')
      and f.code in ('automation_rules','advanced_analytics'))
  or (p.id in ('business','agency','enterprise') and f.code = 'approval_workflows')
  or (p.id in ('agency','enterprise') and f.code in ('client_workspaces','api_webhooks'));

-- One present subscription state per owner; no automatic inserts, no implicit
-- paid access. A missing subscription must be treated as Free by a future resolver.
create table public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_principal text not null unique,
  plan_id text not null references public.billing_plans(id) on delete restrict,
  billing_interval text not null,
  status text not null default 'incomplete',
  payment_provider text not null default 'manual',
  external_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  scheduled_plan_id text references public.billing_plans(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_subscriptions_owner_check check (length(btrim(owner_principal)) > 0),
  constraint billing_subscriptions_interval_check check (billing_interval in ('none','monthly','annual','custom')),
  constraint billing_subscriptions_status_check check (
    status in ('incomplete','active','past_due','paused','canceled','expired')
  ),
  constraint billing_subscriptions_provider_check check (
    payment_provider in ('manual','crypto','external')
  ),
  constraint billing_subscriptions_period_check check (
    (current_period_start is null and current_period_end is null)
    or (current_period_start is not null and current_period_end is not null
       and current_period_end > current_period_start)
  ),
  constraint billing_subscriptions_external_check check (
    external_subscription_id is null or length(btrim(external_subscription_id)) > 0
  ),
  constraint billing_subscriptions_owner_id_key unique (owner_principal, id)
);

create unique index billing_subscriptions_provider_external_idx
  on public.billing_subscriptions (payment_provider, external_subscription_id)
  where external_subscription_id is not null;

create index billing_subscriptions_status_period_idx
  on public.billing_subscriptions (status, current_period_end)
  where current_period_end is not null;

-- Append-only intent: the API must never rewrite historical usage events.
-- The provider cost is denominated in USD; units are TGReposter accounting units.
create table public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  owner_principal text not null,
  request_key text not null,
  actor_user_id uuid,
  operation text not null,
  provider text not null default 'openrouter',
  model_id text not null,
  status text not null,
  input_tokens bigint,
  output_tokens bigint,
  provider_cost_usd numeric(22, 10),
  units_charged numeric(18, 6) not null default 0,
  created_at timestamptz not null default now(),
  constraint ai_usage_events_owner_check check (length(btrim(owner_principal)) > 0),
  constraint ai_usage_events_request_check check (length(btrim(request_key)) between 8 and 128),
  constraint ai_usage_events_provider_check check (provider = 'openrouter'),
  constraint ai_usage_events_model_check check (length(btrim(model_id)) > 0),
  constraint ai_usage_events_operation_check check (length(btrim(operation)) > 0),
  constraint ai_usage_events_status_check check (status in ('pending','success','failed')),
  constraint ai_usage_events_amounts_check check (
    (input_tokens is null or input_tokens >= 0)
    and (output_tokens is null or output_tokens >= 0)
    and (provider_cost_usd is null or provider_cost_usd >= 0)
    and units_charged >= 0
  ),
  constraint ai_usage_events_owner_request_key unique (owner_principal, request_key),
  constraint ai_usage_events_owner_id_key unique (owner_principal, id)
);

create index ai_usage_events_owner_created_idx
  on public.ai_usage_events (owner_principal, created_at desc);

-- Signed credits/debits, separated by source. Included credits belong to a
-- billing period; purchased credits have no recurring period and are retained.
-- Attribution to ai_usage_events uses owner-scoped FK to prevent cross-tenant links.
create table public.ai_unit_ledger (
  id uuid primary key default gen_random_uuid(),
  owner_principal text not null,
  event_key text not null,
  balance_type text not null,
  event_kind text not null,
  units_delta numeric(18, 6) not null,
  period_start timestamptz,
  period_end timestamptz,
  usage_event_id uuid,
  reference text,
  created_at timestamptz not null default now(),
  constraint ai_unit_ledger_owner_check check (length(btrim(owner_principal)) > 0),
  constraint ai_unit_ledger_event_key_check check (length(btrim(event_key)) between 8 and 128),
  constraint ai_unit_ledger_balance_type_check check (balance_type in ('included','purchased')),
  constraint ai_unit_ledger_kind_check check (event_kind in ('grant','consume','adjust','reverse')),
  constraint ai_unit_ledger_delta_check check (
    units_delta <> 0
    and (event_kind <> 'grant' or units_delta > 0)
    and (event_kind <> 'consume' or units_delta < 0)
  ),
  constraint ai_unit_ledger_period_check check (
    (balance_type = 'purchased' and period_start is null and period_end is null)
    or (balance_type = 'included' and period_start is not null
      and period_end is not null and period_end > period_start)
  ),
  constraint ai_unit_ledger_owner_event_key unique (owner_principal, event_key),
  constraint ai_unit_ledger_usage_owner_fkey foreign key (owner_principal, usage_event_id)
    references public.ai_usage_events (owner_principal, id) on delete restrict
);

create index ai_unit_ledger_owner_period_idx
  on public.ai_unit_ledger (owner_principal, balance_type, period_end, created_at desc);

-- Client access is intentionally denied to all commercial tables. A later
-- authenticated server endpoint will expose owner-filtered, redacted reads.
-- service_role/Postgres backend may read/write; clients cannot issue direct SQL.
alter table public.billing_plans enable row level security;
alter table public.billing_features enable row level security;
alter table public.billing_plan_features enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.ai_usage_events enable row level security;
alter table public.ai_unit_ledger enable row level security;

revoke all on public.billing_plans, public.billing_features, public.billing_plan_features,
  public.billing_subscriptions, public.ai_usage_events, public.ai_unit_ledger
  from public, anon, authenticated;

grant select, insert, update, delete on public.billing_plans, public.billing_features,
  public.billing_plan_features, public.billing_subscriptions,
  public.ai_usage_events, public.ai_unit_ledger to service_role;

comment on table public.billing_plans is
  'Backend-owned pricing catalog; all plans are unpublished until launch.';
comment on table public.billing_subscriptions is
  'One owner-scoped subscription state per account; no payment or access change on creation.';
comment on table public.ai_usage_events is
  'Owner-scoped OpenRouter request-level usage audit, idempotent by request_key.';
comment on table public.ai_unit_ledger is
  'Owner-scoped signed AI Unit credits and debits; included units are billing-period-scoped.';
