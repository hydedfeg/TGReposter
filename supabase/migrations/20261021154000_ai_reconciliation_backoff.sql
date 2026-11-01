-- Operational retry markers for commercial OpenRouter usage verification.
-- Does not settle, credit, debit or release ANY AI Units.
-- Pending rows without a provider_generation_id remain manual-review only.
alter table public.ai_usage_events
  add column if not exists reconciliation_attempts integer not null default 0,
  add column if not exists reconciliation_next_attempt_at timestamptz;

alter table public.ai_usage_events
  add constraint ai_usage_reconciliation_attempts_nonnegative
  check (reconciliation_attempts >= 0);

create index if not exists ai_usage_reconciliation_pending_due_idx
  on public.ai_usage_events (reconciliation_next_attempt_at, created_at)
  where provider='openrouter'
    and status='pending'
    and provider_generation_id is not null
    and reconciliation_note is not null;

comment on column public.ai_usage_events.reconciliation_attempts is
  'Count of internal OpenRouter generation-cost lookup attempts; never a charge count.';
comment on column public.ai_usage_events.reconciliation_next_attempt_at is
  'Backoff time for the next bounded provider metadata lookup; null on first try.';
