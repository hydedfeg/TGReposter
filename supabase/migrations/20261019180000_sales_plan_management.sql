-- Draft-only sales plan administration. Does not publish prices or grant access.
-- Keep normalized plan/feature tables as the canonical state.
alter table public.billing_plans
  add column is_enabled boolean not null default true,
  add column catalog_revision integer not null default 1,
  add constraint billing_plans_catalog_revision_positive check (catalog_revision >= 1);

create table public.billing_plan_change_events (
  id uuid primary key default gen_random_uuid(),
  plan_id text not null references public.billing_plans(id) on delete restrict,
  actor_principal text not null check (length(btrim(actor_principal)) between 1 and 255),
  previous_revision integer not null check (previous_revision >= 1),
  new_revision integer not null check (new_revision = previous_revision + 1),
  previous_state jsonb not null,
  new_state jsonb not null,
  created_at timestamptz not null default now(),
  constraint billing_plan_change_events_unique_revision unique (plan_id, new_revision)
);
create index billing_plan_change_events_recent_idx
  on public.billing_plan_change_events(created_at desc);

alter table public.billing_plan_change_events enable row level security;
revoke all on public.billing_plan_change_events from public, anon, authenticated;
grant select, insert on public.billing_plan_change_events to service_role;

comment on column public.billing_plans.is_enabled is
  'Operator draft-selection control. False prevents a plan being offered; separate is_published controls live sales.';
comment on column public.billing_plans.catalog_revision is
  'Optimistic concurrency version for super-admin catalog changes.';
comment on table public.billing_plan_change_events is
  'Append-only backend plan-edit audit. Canonical plan data stays normalized in billing_plans/billing_plan_features.';
