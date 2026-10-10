alter table public.crypto_payment_transactions
  add constraint crypto_payment_transactions_owner_id_key
  unique (owner_principal, id);

alter table public.crypto_payment_events
  drop constraint if exists crypto_payment_events_transaction_fkey;

alter table public.crypto_payment_events
  add constraint crypto_payment_events_owner_transaction_fkey
  foreign key (owner_principal, transaction_id)
  references public.crypto_payment_transactions (owner_principal, id)
  on delete set null (transaction_id);
