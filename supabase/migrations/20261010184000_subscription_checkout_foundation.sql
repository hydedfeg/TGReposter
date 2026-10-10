-- Phase 4: private, non-activating subscription checkout data.
-- Depends on payment infrastructure and earlier commercial plan migrations.
-- Subscription terms retain history; current billing_subscriptions is an active snapshot.
create table public.billing_fx_quotes (
  id uuid primary key default gen_random_uuid(),
  owner_principal text not null,
  product_kind text not null check (product_kind in ('subscription','topup')),
  plan_id text references public.billing_plans(id) on delete restrict,
  billing_interval text check (billing_interval in ('monthly','annual')),
  pack_id text references public.billing_ai_topup_packs(id) on delete restrict,
  eur_cents integer not null check (eur_cents > 0),
  eur_per_usdt numeric(28,12) not null check (eur_per_usdt > 0),
  usdt_amount numeric(36,18) not null check (usdt_amount > 0),
  rate_source text not null check (length(btrim(rate_source)) between 3 and 64),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint billing_fx_quotes_product_check check (
    (product_kind='subscription' and plan_id is not null and billing_interval is not null and pack_id is null)
    or
    (product_kind='topup' and pack_id is not null and plan_id is null and billing_interval is null)
  ),
  constraint billing_fx_quotes_owner_id_unique unique(owner_principal,id),
  constraint billing_fx_quotes_owner_check check(length(btrim(owner_principal)) > 0)
);
create index billing_fx_quotes_owner_expiry_idx
  on public.billing_fx_quotes(owner_principal,expires_at);

create table public.billing_subscription_orders (
  id uuid primary key default gen_random_uuid(),
  owner_principal text not null,
  quote_id uuid not null unique,
  invoice_id uuid not null unique,
  plan_id text not null references public.billing_plans(id) on delete restrict,
  billing_interval text not null check(billing_interval in ('monthly','annual')),
  listed_eur_cents integer not null check(listed_eur_cents > 0),
  quoted_usdt_amount numeric(36,18) not null check(quoted_usdt_amount > 0),
  status text not null default 'pending'
    check(status in ('pending','fulfilled','canceled')),
  fulfilled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_subscription_orders_owner_check check(length(btrim(owner_principal)) > 0),
  constraint billing_subscription_orders_owner_id_key unique(owner_principal,id),
  constraint billing_subscription_orders_owner_quote_fk
    foreign key(owner_principal,quote_id)
    references public.billing_fx_quotes(owner_principal,id) on delete restrict,
  constraint billing_subscription_orders_owner_invoice_fk
    foreign key(owner_principal,invoice_id)
    references public.crypto_payment_invoices(owner_principal,id) on delete restrict,
  constraint billing_subscription_orders_fulfilled_check
    check ((status='fulfilled') = (fulfilled_at is not null))
);

-- A paid renewal has a future term rather than overwriting the currently
-- active subscription snapshot. Future periods activate when due.
create table public.billing_subscription_terms (
  id uuid primary key default gen_random_uuid(),
  owner_principal text not null,
  order_id uuid not null unique,
  plan_id text not null references public.billing_plans(id) on delete restrict,
  billing_interval text not null check(billing_interval in ('monthly','annual')),
  term_start timestamptz not null,
  term_end timestamptz not null,
  status text not null check(status in ('active','scheduled','completed')),
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  constraint billing_subscription_terms_date_check check(term_end > term_start),
  constraint billing_subscription_terms_owner_check check(length(btrim(owner_principal)) > 0),
  constraint billing_subscription_terms_owner_order_fk
    foreign key(owner_principal,order_id)
    references public.billing_subscription_orders(owner_principal,id) on delete restrict
);
create unique index billing_subscription_terms_one_active_idx
  on public.billing_subscription_terms(owner_principal) where status='active';
create unique index billing_subscription_terms_one_scheduled_idx
  on public.billing_subscription_terms(owner_principal) where status='scheduled';
create index billing_subscription_terms_owner_dates_idx
  on public.billing_subscription_terms(owner_principal,term_start,term_end);

alter table public.billing_fx_quotes enable row level security;
alter table public.billing_subscription_orders enable row level security;
alter table public.billing_subscription_terms enable row level security;
revoke all on public.billing_fx_quotes,public.billing_subscription_orders,
  public.billing_subscription_terms from public,anon,authenticated;
grant select,insert,update,delete on public.billing_fx_quotes,
  public.billing_subscription_orders,public.billing_subscription_terms to service_role;
comment on table public.billing_fx_quotes is
  'Server-issued short-lived EUR-to-USDT quote, never supplied or updated by browser clients.';
comment on table public.billing_subscription_orders is
  'One owner-scoped invoice/order; paid invoice alone never activates an account.';
comment on table public.billing_subscription_terms is
  'Immutable-looking subscription entitlement intervals, future renewals scheduled rather than activated early.';
