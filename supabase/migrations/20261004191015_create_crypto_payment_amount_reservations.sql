create table if not exists public.crypto_payment_amount_reservations (
  network text not null,
  receiving_address text not null,
  token_identifier text not null,
  expected_amount numeric(36, 18) not null,
  owner_principal text not null,
  invoice_id uuid not null,
  reserved_until timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint crypto_payment_amount_reservations_network_check
    check (network = any (array['bsc'::text, 'ethereum'::text, 'ton'::text])),
  constraint crypto_payment_amount_reservations_address_check
    check (char_length(btrim(receiving_address)) > 0),
  constraint crypto_payment_amount_reservations_token_check
    check (char_length(btrim(token_identifier)) > 0),
  constraint crypto_payment_amount_reservations_amount_check
    check (expected_amount > 0),
  constraint crypto_payment_amount_reservations_owner_check
    check (char_length(btrim(owner_principal)) > 0),
  constraint crypto_payment_amount_reservations_pkey
    primary key (network, receiving_address, token_identifier, expected_amount),
  constraint crypto_payment_amount_reservations_owner_invoice_key
    unique (owner_principal, invoice_id),
  constraint crypto_payment_amount_reservations_owner_invoice_fkey
    foreign key (owner_principal, invoice_id)
    references public.crypto_payment_invoices (owner_principal, id)
    on delete cascade
);

create index if not exists crypto_payment_amount_reservations_expiry_idx
  on public.crypto_payment_amount_reservations (reserved_until);

alter table public.crypto_payment_amount_reservations enable row level security;
revoke all on table public.crypto_payment_amount_reservations from anon, authenticated;

comment on table public.crypto_payment_amount_reservations is
  'Backend-only collision guard for unique merchant-address payment amounts. Reservations contain no wallet signing secrets.';
