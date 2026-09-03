-- Complete TGReposter's per-user ownership model.
--
-- Application data is tenant-scoped. The only intentionally non-tenant tables are
-- authentication/system infrastructure and public.posts, which is an internal
-- ingestion cache for deduplicating Telegram fetches. No user reads public.posts
-- directly; user-visible content is selected through owner-scoped user_inbox_items.

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

  alter table public.source_channels add column if not exists owner_principal text;
  alter table public.filters add column if not exists owner_principal text;
  alter table public.ai_settings add column if not exists owner_principal text;
  alter table public.telegram_bot_accounts add column if not exists owner_principal text;
  alter table public.promotion_targets add column if not exists owner_principal text;
  alter table public.promotion_campaigns add column if not exists owner_principal text;
  alter table public.promotion_campaign_posts add column if not exists owner_principal text;
  alter table public.promotion_deliveries add column if not exists owner_principal text;
  alter table public.promotion_delivery_attempts add column if not exists owner_principal text;

  update public.source_channels set owner_principal = initial_owner where owner_principal is null;
  update public.filters set owner_principal = initial_owner where owner_principal is null;
  update public.ai_settings set owner_principal = initial_owner where owner_principal is null;
  update public.telegram_bot_accounts set owner_principal = initial_owner where owner_principal is null;
  update public.promotion_targets set owner_principal = initial_owner where owner_principal is null;
  update public.promotion_campaigns set owner_principal = initial_owner where owner_principal is null;
  update public.promotion_campaign_posts set owner_principal = initial_owner where owner_principal is null;
  update public.promotion_deliveries set owner_principal = initial_owner where owner_principal is null;
  update public.promotion_delivery_attempts set owner_principal = initial_owner where owner_principal is null;
end
$$;

-- A Telegram username may be monitored by more than one user, but every
-- subscription row belongs to exactly one user.
-- Keep the legacy global username uniqueness during the prepare phase so the
-- currently deployed backend remains compatible. It is removed by the
-- finalize migration after the owner-aware backend is live.
create unique index if not exists source_channels_owner_username_key
  on public.source_channels (owner_principal, username);

create unique index if not exists filters_owner_principal_key
  on public.filters (owner_principal);

create unique index if not exists ai_settings_owner_principal_key
  on public.ai_settings (owner_principal);

-- Promotion credential references may repeat between users because ownership,
-- not a global identifier, is the isolation boundary.
-- Keep legacy credential_ref uniqueness during the prepare phase for rollout
-- compatibility. The finalize migration removes it after backend cutover.
create unique index if not exists telegram_bot_accounts_owner_credential_ref_key
  on public.telegram_bot_accounts (owner_principal, credential_ref);

create index if not exists idx_promotion_targets_owner
  on public.promotion_targets (owner_principal, enabled, created_at);
create index if not exists idx_promotion_campaigns_owner_status
  on public.promotion_campaigns (owner_principal, status, created_at desc);
create index if not exists idx_promotion_campaign_posts_owner
  on public.promotion_campaign_posts (owner_principal, campaign_id, position);
create index if not exists idx_promotion_deliveries_owner
  on public.promotion_deliveries (owner_principal, status, created_at);
create index if not exists idx_promotion_delivery_attempts_owner
  on public.promotion_delivery_attempts (owner_principal, attempted_at desc);

create index if not exists idx_source_channels_owner_enabled
  on public.source_channels (owner_principal, enabled, created_at);
create index if not exists idx_filters_owner_updated
  on public.filters (owner_principal, updated_at desc);
create index if not exists idx_ai_settings_owner_updated
  on public.ai_settings (owner_principal, updated_at desc);

-- The prepare phase intentionally leaves newly-added owner columns nullable.
-- This keeps the currently deployed legacy backend operational until the new
-- owner-aware backend is live. The finalize migration backfills any race-window
-- rows, enforces NOT NULL, and removes obsolete global uniqueness constraints.

comment on column public.source_channels.owner_principal is
  'Server-derived owner for this user source subscription.';
comment on column public.filters.owner_principal is
  'Server-derived owner for this user filter configuration.';
comment on column public.ai_settings.owner_principal is
  'Server-derived owner for this user AI configuration.';
comment on column public.telegram_bot_accounts.owner_principal is
  'Server-derived owner for this user promotion bot account.';
comment on column public.promotion_targets.owner_principal is
  'Server-derived owner for this user promotion target.';
comment on column public.promotion_campaigns.owner_principal is
  'Server-derived owner for this user promotion campaign.';
comment on table public.posts is
  'Internal Telegram ingestion cache only. User-visible content ownership lives in user_inbox_items.';

-- Keep user/application tables backend-only.
alter table public.source_channels enable row level security;
alter table public.filters enable row level security;
alter table public.ai_settings enable row level security;
alter table public.telegram_bot_accounts enable row level security;
alter table public.promotion_targets enable row level security;
alter table public.promotion_campaigns enable row level security;
alter table public.promotion_campaign_posts enable row level security;
alter table public.promotion_deliveries enable row level security;
alter table public.promotion_delivery_attempts enable row level security;

revoke all on table public.source_channels from anon, authenticated;
revoke all on table public.filters from anon, authenticated;
revoke all on table public.ai_settings from anon, authenticated;
revoke all on table public.telegram_bot_accounts from anon, authenticated;
revoke all on table public.promotion_targets from anon, authenticated;
revoke all on table public.promotion_campaigns from anon, authenticated;
revoke all on table public.promotion_campaign_posts from anon, authenticated;
revoke all on table public.promotion_deliveries from anon, authenticated;
revoke all on table public.promotion_delivery_attempts from anon, authenticated;


-- Child promotion ownership is derived from its owned parent. This keeps every
-- row tenant-attributable without trusting caller-supplied owner values.
create or replace function public.tgreposter_set_promotion_target_owner()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  select owner_principal
  into new.owner_principal
  from public.telegram_bot_accounts
  where id = new.bot_account_id;

  if new.owner_principal is null then
    raise exception 'PROMOTION_BOT_OWNER_NOT_FOUND';
  end if;
  return new;
end;
$$;

create or replace function public.tgreposter_set_campaign_post_owner()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  select owner_principal
  into new.owner_principal
  from public.promotion_campaigns
  where id = new.campaign_id;

  if new.owner_principal is null then
    raise exception 'PROMOTION_CAMPAIGN_OWNER_NOT_FOUND';
  end if;
  return new;
end;
$$;

create or replace function public.tgreposter_set_delivery_owner()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  select owner_principal
  into new.owner_principal
  from public.promotion_campaign_posts
  where id = new.campaign_post_id;

  if new.owner_principal is null then
    raise exception 'PROMOTION_CAMPAIGN_POST_OWNER_NOT_FOUND';
  end if;
  return new;
end;
$$;

create or replace function public.tgreposter_set_delivery_attempt_owner()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  select owner_principal
  into new.owner_principal
  from public.promotion_deliveries
  where id = new.delivery_id;

  if new.owner_principal is null then
    raise exception 'PROMOTION_DELIVERY_OWNER_NOT_FOUND';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tgreposter_promotion_target_owner on public.promotion_targets;
create trigger trg_tgreposter_promotion_target_owner
before insert or update of bot_account_id on public.promotion_targets
for each row execute function public.tgreposter_set_promotion_target_owner();

drop trigger if exists trg_tgreposter_campaign_post_owner on public.promotion_campaign_posts;
create trigger trg_tgreposter_campaign_post_owner
before insert or update of campaign_id on public.promotion_campaign_posts
for each row execute function public.tgreposter_set_campaign_post_owner();

drop trigger if exists trg_tgreposter_delivery_owner on public.promotion_deliveries;
create trigger trg_tgreposter_delivery_owner
before insert or update of campaign_post_id on public.promotion_deliveries
for each row execute function public.tgreposter_set_delivery_owner();

drop trigger if exists trg_tgreposter_delivery_attempt_owner on public.promotion_delivery_attempts;
create trigger trg_tgreposter_delivery_attempt_owner
before insert or update of delivery_id on public.promotion_delivery_attempts
for each row execute function public.tgreposter_set_delivery_attempt_owner();

revoke execute on function public.tgreposter_set_promotion_target_owner() from public, anon, authenticated;
revoke execute on function public.tgreposter_set_campaign_post_owner() from public, anon, authenticated;
revoke execute on function public.tgreposter_set_delivery_owner() from public, anon, authenticated;
revoke execute on function public.tgreposter_set_delivery_attempt_owner() from public, anon, authenticated;
