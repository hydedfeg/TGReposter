-- Packaged manually with user approval after CLI download was blocked.
-- Requires the owner-aware runtime and both 20260905 finalization migrations.
-- Those migrations already require explicit owners and enforce composite FKs.
-- Legacy BEFORE triggers overwrite the caller's owner with the parent's owner,
-- defeating rejection of mismatched writes. Do not silently retarget writes.
-- No data is deleted or reassigned; table grants and RLS remain unchanged.

begin;
set local lock_timeout = '5s';

drop trigger if exists trg_tgreposter_promotion_target_owner on public.promotion_targets;
drop trigger if exists trg_tgreposter_campaign_post_owner on public.promotion_campaign_posts;
drop trigger if exists trg_tgreposter_delivery_owner on public.promotion_deliveries;
drop trigger if exists trg_tgreposter_delivery_attempt_owner on public.promotion_delivery_attempts;

-- No CASCADE: unexpected dependencies must stop deployment for review.
drop function if exists public.tgreposter_set_promotion_target_owner();
drop function if exists public.tgreposter_set_campaign_post_owner();
drop function if exists public.tgreposter_set_delivery_owner();
drop function if exists public.tgreposter_set_delivery_attempt_owner();

commit;
