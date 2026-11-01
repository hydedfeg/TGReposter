-- Commercial OpenRouter request reconciliation metadata.
-- The parent commercial foundation migration must run before this migration.
-- Non-activating: no live requests are charged by introducing these columns.
alter table public.ai_usage_events
  add column provider_generation_id text,
  add column reconciliation_note text;

create unique index ai_usage_events_provider_generation_idx
  on public.ai_usage_events(provider, provider_generation_id)
  where provider_generation_id is not null;

comment on column public.ai_usage_events.provider_generation_id is
  'OpenRouter generation identifier for authoritative later cost reconciliation.';

comment on column public.ai_usage_events.reconciliation_note is
  'Backend-only operational note. Pending events must be reconciled, not silently refunded.';
