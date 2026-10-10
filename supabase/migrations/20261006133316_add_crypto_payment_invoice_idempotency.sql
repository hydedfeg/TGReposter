alter table public.crypto_payment_invoices
  add column if not exists requested_amount numeric(36, 18),
  add column if not exists request_key text;

update public.crypto_payment_invoices
set requested_amount = expected_amount
where requested_amount is null;

alter table public.crypto_payment_invoices
  alter column requested_amount set not null;

alter table public.crypto_payment_invoices
  add constraint crypto_payment_invoices_requested_amount_check
  check (requested_amount > 0);

alter table public.crypto_payment_invoices
  add constraint crypto_payment_invoices_request_key_check
  check (request_key is null or char_length(btrim(request_key)) between 8 and 128);

create unique index if not exists crypto_payment_invoices_owner_request_key_idx
  on public.crypto_payment_invoices (owner_principal, request_key)
  where request_key is not null;
