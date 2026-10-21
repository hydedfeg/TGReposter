create index if not exists crypto_payment_events_transaction_idx
  on public.crypto_payment_events (transaction_id)
  where transaction_id is not null;
