-- Phase 7: append-only subscription lifecycle audit. No account changes.
-- This migration is intentionally non-activating.
create table public.billing_subscription_events (
  id uuid primary key default gen_random_uuid(),
  owner_principal text not null,
  subscription_id uuid not null,
  event_type text not null check (
    event_type in ('cancel_scheduled','cancel_reversed','expired')
  ),
  created_at timestamptz not null default now(),
  constraint billing_subscription_events_owner_subscription_fk
    foreign key (owner_principal,subscription_id)
    references public.billing_subscriptions(owner_principal,id) on delete restrict,
  constraint billing_subscription_events_owner_check
    check (length(btrim(owner_principal))>0)
);
create index billing_subscription_events_owner_recent_idx
 on public.billing_subscription_events(owner_principal,created_at desc);
alter table public.billing_subscription_events enable row level security;
revoke all on public.billing_subscription_events from public,anon,authenticated;
grant select,insert on public.billing_subscription_events to service_role;
comment on table public.billing_subscription_events is
 'Backend-only immutable-intent audit of paid subscription cancellation and expiry transitions. No direct browser access.';
