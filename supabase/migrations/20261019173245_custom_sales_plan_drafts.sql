-- Draft-only custom tiers. No customer publication, orders or subscriptions.
-- Keep built-in plan IDs reserved and never allow custom plan publication
-- until paid-order, lifecycle, entitlement, refund and history policies are approved.
alter table public.billing_plans
  drop constraint billing_plans_id_check;

alter table public.billing_plans
  add constraint billing_plans_id_check
    check (id in ('free','creator','professional','business','agency','enterprise')
      or id ~ '^custom_[a-z][a-z0-9_]{2,29}$'),
  add constraint billing_plans_custom_draft_only_check
    check (id !~ '^custom_' or is_published=false);

-- Initial creation event uses 0 -> 1 and an empty previous-state snapshot;
-- existing edits remain N -> N+1 (N >= 1).
alter table public.billing_plan_change_events
  drop constraint billing_plan_change_events_previous_revision_check;

alter table public.billing_plan_change_events
  add constraint billing_plan_change_events_previous_revision_check
    check (previous_revision >= 0);

comment on constraint billing_plans_custom_draft_only_check
  on public.billing_plans is
  'Custom sales tiers cannot become payable while checkout and entitlement compatibility are prelaunch.';
