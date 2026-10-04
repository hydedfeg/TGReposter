-- Crypto payment infrastructure only.
-- No pricing, plans, subscriptions, private keys, seed phrases, or custody logic live here.
-- Browser roles cannot access these tables directly; the authenticated Railway backend
-- remains the authority and scopes every operation by owner_principal.

create table if not exists public.crypto_payment_invoices (
  id uuid primary key default gen_random_uuid(),
  owner_principal text not null,
  asset_code text not null default 'USDT',
  network text not null,
  expected_amount numeric(36, 18) not null,
  receiving_address text not null,
  token_identifier text not null,
  status text not null default 'pending',
  expires_at timestamptz not null,
  detected_at timestamptz,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint crypto_payment_invoices_owner_check
    check (char_length(btrim(owner_principal)) > 0),
  constraint crypto_payment_invoices_asset_check
    check (asset_code = 'USDT'),
  constraint crypto_payment_invoices_network_check
    check (network = any (array['bsc'::text, 'ethereum'::text, 'ton'::text])),
  constraint crypto_payment_invoices_amount_check
    check (expected_amount > 0),
  constraint crypto_payment_invoices_address_check
    check (char_length(btrim(receiving_address)) > 0),
  constraint crypto_payment_invoices_token_check
    check (char_length(btrim(token_identifier)) > 0),
  constraint crypto_payment_invoices_status_check
    check (
      status = any (
        array[
          'pending'::text,
          'detected'::text,
          'confirming'::text,
          'paid'::text,
          'expired'::text,
          'underpaid'::text,
          'overpaid'::text,
          'failed'::text,
          'cancelled'::text
        ]
      )
    ),
  constraint crypto_payment_invoices_owner_id_key unique (owner_principal, id)
);

create index if not exists crypto_payment_invoices_owner_created_idx
  on public.crypto_payment_invoices (owner_principal, created_at desc);

create index if not exists crypto_payment_invoices_network_status_idx
  on public.crypto_payment_invoices (network, status, expires_at);

create table if not exists public.crypto_payment_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_principal text not null,
  invoice_id uuid not null,
  network text not null,
  tx_hash text not null,
  event_index text not null default '0',
  token_identifier text not null,
  from_address text,
  to_address text not null,
  amount numeric(36, 18) not null,
  block_reference text,
  confirmations integer not null default 0,
  status text not null default 'detected',
  first_seen_at timestamptz not null default timezone('utc', now()),
  confirmed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint crypto_payment_transactions_owner_check
    check (char_length(btrim(owner_principal)) > 0),
  constraint crypto_payment_transactions_network_check
    check (network = any (array['bsc'::text, 'ethereum'::text, 'ton'::text])),
  constraint crypto_payment_transactions_tx_hash_check
    check (char_length(btrim(tx_hash)) > 0),
  constraint crypto_payment_transactions_token_check
    check (char_length(btrim(token_identifier)) > 0),
  constraint crypto_payment_transactions_to_address_check
    check (char_length(btrim(to_address)) > 0),
  constraint crypto_payment_transactions_amount_check
    check (amount > 0),
  constraint crypto_payment_transactions_confirmations_check
    check (confirmations >= 0),
  constraint crypto_payment_transactions_status_check
    check (
      status = any (
        array[
          'detected'::text,
          'confirming'::text,
          'confirmed'::text,
          'rejected'::text
        ]
      )
    ),
  constraint crypto_payment_transactions_owner_invoice_fkey
    foreign key (owner_principal, invoice_id)
    references public.crypto_payment_invoices (owner_principal, id)
    on delete cascade,
  constraint crypto_payment_transactions_chain_event_key
    unique (network, tx_hash, event_index)
);

create index if not exists crypto_payment_transactions_invoice_idx
  on public.crypto_payment_transactions (owner_principal, invoice_id, first_seen_at);

create index if not exists crypto_payment_transactions_pending_confirmation_idx
  on public.crypto_payment_transactions (network, status, confirmations);

create table if not exists public.crypto_payment_events (
  id uuid primary key default gen_random_uuid(),
  owner_principal text not null,
  invoice_id uuid not null,
  transaction_id uuid,
  source text not null,
  source_event_id text not null,
  event_type text not null,
  occurred_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz not null default timezone('utc', now()),
  constraint crypto_payment_events_owner_check
    check (char_length(btrim(owner_principal)) > 0),
  constraint crypto_payment_events_source_check
    check (source = any (array['system'::text, 'bsc'::text, 'ethereum'::text, 'ton'::text])),
  constraint crypto_payment_events_source_event_id_check
    check (char_length(btrim(source_event_id)) > 0),
  constraint crypto_payment_events_event_type_check
    check (char_length(btrim(event_type)) > 0),
  constraint crypto_payment_events_owner_invoice_fkey
    foreign key (owner_principal, invoice_id)
    references public.crypto_payment_invoices (owner_principal, id)
    on delete cascade,
  constraint crypto_payment_events_transaction_fkey
    foreign key (transaction_id)
    references public.crypto_payment_transactions (id)
    on delete set null,
  constraint crypto_payment_events_source_event_key
    unique (source, source_event_id)
);

create index if not exists crypto_payment_events_invoice_idx
  on public.crypto_payment_events (owner_principal, invoice_id, occurred_at);

create index if not exists crypto_payment_events_transaction_idx
  on public.crypto_payment_events (transaction_id)
  where transaction_id is not null;

alter table public.crypto_payment_invoices enable row level security;
alter table public.crypto_payment_transactions enable row level security;
alter table public.crypto_payment_events enable row level security;

revoke all on table public.crypto_payment_invoices from anon, authenticated;
revoke all on table public.crypto_payment_transactions from anon, authenticated;
revoke all on table public.crypto_payment_events from anon, authenticated;

comment on table public.crypto_payment_invoices is
  'Backend-owned, per-user crypto invoice ledger. Contains public receiving metadata only; never private keys or seed phrases.';

comment on table public.crypto_payment_transactions is
  'Backend-owned normalized on-chain payment observations linked to a user-scoped invoice.';

comment on table public.crypto_payment_events is
  'Idempotent crypto payment event log for invoice and transaction state changes.';
