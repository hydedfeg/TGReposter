create table if not exists public.crypto_payment_network_state (
  network text not null,
  token_identifier text not null,
  receiving_address text not null,
  cursor text not null,
  last_scanned_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint crypto_payment_network_state_network_check
    check (network = any (array['bsc'::text, 'ethereum'::text, 'ton'::text])),
  constraint crypto_payment_network_state_token_check
    check (char_length(btrim(token_identifier)) > 0),
  constraint crypto_payment_network_state_receiving_address_check
    check (char_length(btrim(receiving_address)) > 0),
  constraint crypto_payment_network_state_cursor_check
    check (char_length(btrim(cursor)) > 0),
  primary key (network, token_identifier, receiving_address)
);

alter table public.crypto_payment_network_state enable row level security;
revoke all on table public.crypto_payment_network_state from anon, authenticated;

comment on table public.crypto_payment_network_state is
  'Backend-only chain scanner checkpoint state keyed by network, token and receiving address. Contains no user or wallet secret data.';
