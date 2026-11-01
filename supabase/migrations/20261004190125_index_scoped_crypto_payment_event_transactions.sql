drop index if exists public.crypto_payment_events_transaction_idx;

create index if not exists crypto_payment_events_owner_transaction_idx
  on public.crypto_payment_events (owner_principal, transaction_id)
  where transaction_id is not null;
