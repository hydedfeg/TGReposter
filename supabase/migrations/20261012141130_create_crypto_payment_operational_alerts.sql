-- Backend-only operational alert state; no payment settlement authority.
create table if not exists public.crypto_payment_operational_alerts (
  id bigint generated always as identity primary key,
  fingerprint text not null unique,
  category text not null check (category in ('scanner', 'invoice', 'unassigned')),
  code text not null,
  network text not null check (network in ('bsc','ethereum','ton')),
  severity text not null check (severity in ('warning','critical')),
  owner_principal text,
  invoice_id uuid,
  tx_hash text,
  status text not null default 'open' check (status in ('open','resolved')),
  notification_state text not null default 'skipped' check (notification_state in ('skipped','pending','sent')),
  notification_attempts integer not null default 0 check (notification_attempts >= 0),
  next_notification_at timestamptz,
  notified_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint crypto_alert_fingerprint_check check (length(fingerprint) between 3 and 255),
  constraint crypto_alert_owner_invoice_check check (
    (category='invoice' and owner_principal is not null and invoice_id is not null)
    or (category<>'invoice' and owner_principal is null and invoice_id is null)
  ),
  constraint crypto_alert_invoice_owner_fk foreign key (owner_principal,invoice_id)
    references public.crypto_payment_invoices (owner_principal,id) on delete cascade
);
create index if not exists crypto_alert_open_latest_idx
  on public.crypto_payment_operational_alerts (last_seen_at desc) where status='open';
create index if not exists crypto_alert_pending_delivery_idx
  on public.crypto_payment_operational_alerts (next_notification_at,id)
  where status='open' and notification_state='pending';
alter table public.crypto_payment_operational_alerts enable row level security;
revoke all on public.crypto_payment_operational_alerts from anon, authenticated;
comment on table public.crypto_payment_operational_alerts is
  'Platform super-admin operational alerts, deduplicated and updated only by backend. Never authorizes invoice credit or exposes alert transport secrets.';
