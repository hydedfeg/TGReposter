-- Internal retry/backoff state for commercial billing job attempts.
-- Does not activate billing or change existing subscription state.
create table public.billing_operation_attempts (
  stage text not null check(stage in ('subscriptions','topups','renewals','allowances')),
  owner_principal text not null check(length(btrim(owner_principal)) > 0),
  item_id uuid not null,
  failures integer not null default 1 check(failures between 1 and 1000000),
  last_error_code text not null check(length(btrim(last_error_code)) between 1 and 64),
  next_retry_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(stage,owner_principal,item_id)
);
create index billing_operation_attempts_next_idx
  on public.billing_operation_attempts(stage,next_retry_at);
alter table public.billing_operation_attempts enable row level security;
revoke all on public.billing_operation_attempts from public,anon,authenticated;
grant select,insert,update,delete on public.billing_operation_attempts to service_role;
comment on table public.billing_operation_attempts is
  'Private per-owner billing fulfillment retries. Unresolved verified payments are never discarded.';
