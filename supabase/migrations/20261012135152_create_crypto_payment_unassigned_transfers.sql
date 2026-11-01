-- Staging-first durable review ledger for chain transfers that cannot be attributed
-- to exactly one active user invoice. Never assign a user owner without proof.
-- Intentionally omits sender addresses. This ledger does not credit invoices.
create table if not exists public.crypto_payment_unassigned_transfers (
  network text not null,
  tx_hash text not null,
  event_index text not null,
  token_identifier text not null,
  receiving_address text not null,
  amount numeric(36,18) not null,
  block_reference text,
  confirmations integer not null default 0,
  observed_at timestamptz not null,
  reason text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint crypto_unassigned_network_check check (network in ('bsc','ethereum','ton')),
  constraint crypto_unassigned_tx_check check (length(btrim(tx_hash)) > 0),
  constraint crypto_unassigned_index_check check (length(btrim(event_index)) > 0),
  constraint crypto_unassigned_token_check check (length(btrim(token_identifier)) > 0),
  constraint crypto_unassigned_receiver_check check (length(btrim(receiving_address)) > 0),
  constraint crypto_unassigned_amount_check check (amount > 0),
  constraint crypto_unassigned_confirmation_check check (confirmations >= 0),
  constraint crypto_unassigned_reason_check check (reason in ('unmatched','ambiguous')),
  primary key (network, tx_hash, event_index)
);
create index if not exists crypto_unassigned_open_seen_idx
  on public.crypto_payment_unassigned_transfers (last_seen_at desc)
  where resolved_at is null;
alter table public.crypto_payment_unassigned_transfers enable row level security;
revoke all on table public.crypto_payment_unassigned_transfers from anon, authenticated;
comment on table public.crypto_payment_unassigned_transfers is
  'Platform-only, deduplicated observations with no proven invoice owner. No sender address, browser privileges, wallet secrets, or automatic credit.';
