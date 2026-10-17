-- Backend-only owner-scoped top-up checkout orders.
-- Attaching an invoice is not sufficient to grant a credit.
create table public.billing_ai_topup_orders (
 id uuid primary key default gen_random_uuid(),
 owner_principal text not null,
 invoice_id uuid not null,
 pack_id text not null references public.billing_ai_topup_packs(id) on delete restrict,
 ai_units numeric(18,6) not null check (ai_units > 0),
 listed_eur_cents integer not null check (listed_eur_cents > 0),
 quoted_usdt_amount numeric(36,18) not null check (quoted_usdt_amount > 0),
 quote_reference text not null
   check (char_length(btrim(quote_reference)) between 8 and 128),
 status text not null default 'pending'
   check (status in ('pending','fulfilled','canceled')),
 fulfilled_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint billing_ai_topup_orders_owner_check
   check (char_length(btrim(owner_principal)) > 0),
 constraint billing_ai_topup_orders_owner_id_unique unique (owner_principal,id),
 constraint billing_ai_topup_orders_invoice_unique unique (invoice_id),
 constraint billing_ai_topup_orders_owner_invoice_fkey
   foreign key (owner_principal,invoice_id)
   references public.crypto_payment_invoices(owner_principal,id) on delete restrict,
 constraint billing_ai_topup_orders_fulfilled_check
   check ((status = 'fulfilled') = (fulfilled_at is not null))
);
create index billing_ai_topup_orders_owner_created_idx
 on public.billing_ai_topup_orders(owner_principal,created_at desc);
create index billing_ai_topup_orders_pending_idx
 on public.billing_ai_topup_orders(status,created_at) where status='pending';
alter table public.billing_ai_topup_orders enable row level security;
revoke all on public.billing_ai_topup_orders from public,anon,authenticated;
grant select,insert,update,delete on public.billing_ai_topup_orders to service_role;