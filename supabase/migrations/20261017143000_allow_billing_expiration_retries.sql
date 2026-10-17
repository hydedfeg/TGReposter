-- Align retry stage validation with the billing worker's expiration workflow.
-- The staging database already permits this stage; safe to reapply there.
-- Existing retry rows remain unchanged; no payment or subscription mutation.
alter table public.billing_operation_attempts
  drop constraint if exists billing_operation_attempts_stage_check;
alter table public.billing_operation_attempts
  add constraint billing_operation_attempts_stage_check
  check (stage in ('subscriptions','topups','renewals','expirations','allowances'));
