-- Persistent checkout abuse protection. Private backend-only records.
-- This table does not create charges, invoices, subscriptions or credits.
create table public.billing_checkout_rate_limits (
  owner_principal text not null check (length(btrim(owner_principal)) between 1 and 255),
  action text not null check (action in ('quote','invoice')),
  minute_started_at timestamptz not null default now(),
  minute_hits integer not null check (minute_hits between 1 and 100000),
  hour_started_at timestamptz not null default now(),
  hour_hits integer not null check (hour_hits between 1 and 100000),
  updated_at timestamptz not null default now(),
  primary key (owner_principal,action)
);
alter table public.billing_checkout_rate_limits enable row level security;
revoke all on public.billing_checkout_rate_limits from public,anon,authenticated;
grant select,insert,update,delete on public.billing_checkout_rate_limits to service_role;
comment on table public.billing_checkout_rate_limits is
  'Owner-scoped atomic quote/invoice budgets for customer USDT checkout. Private backend-only.';
