-- Finalize full tenant isolation after the owner-aware backend is live.
-- This migration is intentionally applied only after production has switched
-- to the new backend code.

do $$
declare
  initial_owner text;
begin
  select 'legacy:' || lower(btrim(user_record->>'username'))
  into initial_owner
  from public.curator_settings c
  cross join lateral jsonb_array_elements(coalesce(c.data->'users', '[]'::jsonb)) as user_record
  where c.id = 'default'
    and user_record->>'role' = 'super-admin'
    and coalesce((user_record->>'isActive')::boolean, true) = true
    and nullif(btrim(user_record->>'username'), '') is not null
  order by coalesce(user_record->>'createdAt', '') asc
  limit 1;

  if initial_owner is null then
    select 'supabase:' || id::text
    into initial_owner
    from public.profiles
    where role = 'super-admin'
      and is_active = true
    order by created_at asc nulls last, id asc
    limit 1;
  end if;

  if initial_owner is null then
    initial_owner := 'legacy:system_admin';
  end if;

  update public.source_channels set owner_principal = initial_owner where owner_principal is null;
  update public.filters set owner_principal = initial_owner where owner_principal is null;
  update public.ai_settings set owner_principal = initial_owner where owner_principal is null;
  update public.telegram_bot_accounts set owner_principal = initial_owner where owner_principal is null;
  update public.promotion_targets set owner_principal = initial_owner where owner_principal is null;
  update public.promotion_campaigns set owner_principal = initial_owner where owner_principal is null;
  update public.promotion_campaign_posts set owner_principal = initial_owner where owner_principal is null;
  update public.promotion_deliveries set owner_principal = initial_owner where owner_principal is null;
  update public.promotion_delivery_attempts set owner_principal = initial_owner where owner_principal is null;
  update public.destination_targets set owner_principal = initial_owner where owner_principal is null;
end
$$;

alter table public.destination_targets alter column owner_principal set not null;
alter table public.source_channels alter column owner_principal set not null;
alter table public.filters alter column owner_principal set not null;
alter table public.ai_settings alter column owner_principal set not null;
alter table public.telegram_bot_accounts alter column owner_principal set not null;
alter table public.promotion_targets alter column owner_principal set not null;
alter table public.promotion_campaigns alter column owner_principal set not null;
alter table public.promotion_campaign_posts alter column owner_principal set not null;
alter table public.promotion_deliveries alter column owner_principal set not null;
alter table public.promotion_delivery_attempts alter column owner_principal set not null;

-- Remove the obsolete global uniqueness boundaries. The owner-scoped unique
-- indexes created by the prepare migration are now authoritative.
alter table public.source_channels
  drop constraint if exists source_channels_username_key;
drop index if exists public.source_channels_username_key;

alter table public.telegram_bot_accounts
  drop constraint if exists telegram_bot_accounts_credential_ref_key;
drop index if exists public.telegram_bot_accounts_credential_ref_key;
