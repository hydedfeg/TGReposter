-- Normalize runtime configuration into dedicated PostgreSQL tables.
-- This migration is intentionally non-destructive to curator_settings so the
-- previous runtime can still be rolled back while the backend cutover occurs.

alter table public.source_channels
  add column if not exists last_scan_at timestamptz,
  add column if not exists status text not null default 'idle',
  add column if not exists error_message text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.destination_targets
  add column if not exists client_id text,
  add column if not exists status text not null default 'idle',
  add column if not exists error_message text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.filters
  add column if not exists updated_at timestamptz not null default now();

alter table public.posts
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists destination_targets_client_id_key
  on public.destination_targets (client_id)
  where client_id is not null;

create index if not exists idx_source_channels_enabled
  on public.source_channels (enabled)
  where enabled = true;

create index if not exists idx_posts_status_published_at
  on public.posts (status, published_at desc);

create index if not exists idx_posts_inbox_expiry
  on public.posts (published_at)
  where status in ('pending', 'archived');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.source_channels'::regclass
      and conname = 'source_channels_status_check'
  ) then
    alter table public.source_channels
      add constraint source_channels_status_check
      check (status in ('idle', 'fetching', 'success', 'error')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.destination_targets'::regclass
      and conname = 'destination_targets_status_check'
  ) then
    alter table public.destination_targets
      add constraint destination_targets_status_check
      check (status in ('idle', 'success', 'error')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.posts'::regclass
      and conname = 'posts_status_check'
  ) then
    alter table public.posts
      add constraint posts_status_check
      check (status in ('pending', 'approved', 'posted', 'archived')) not valid;
  end if;
end $$;

with legacy as (
  select value as channel
  from public.curator_settings c
  cross join lateral jsonb_array_elements(coalesce(c.data->'channels', '[]'::jsonb))
  where c.id = 'default'
)
insert into public.source_channels
  (username, display_name, enabled, last_scan_at, status, error_message, updated_at)
select
  lower(trim(leading '@' from channel->>'username')),
  nullif(channel->>'name', ''),
  coalesce((channel->>'enabled')::boolean, true),
  nullif(channel->>'lastFetched', '')::timestamptz,
  case
    when channel->>'status' in ('idle','fetching','success','error') then channel->>'status'
    else 'idle'
  end,
  nullif(channel->>'errorMessage', ''),
  now()
from legacy
where nullif(channel->>'username', '') is not null
on conflict (username) do update
set display_name = excluded.display_name,
    enabled = excluded.enabled,
    last_scan_at = excluded.last_scan_at,
    status = excluded.status,
    error_message = excluded.error_message,
    updated_at = now();

delete from public.filters;
insert into public.filters
  (positive_keywords, negative_keywords, required_hashtags, case_sensitive, created_at, updated_at)
select
  coalesce(array(select jsonb_array_elements_text(coalesce(data->'filters'->'positiveKeywords', '[]'::jsonb))), '{}'::text[]),
  coalesce(array(select jsonb_array_elements_text(coalesce(data->'filters'->'negativeKeywords', '[]'::jsonb))), '{}'::text[]),
  coalesce(array(select jsonb_array_elements_text(coalesce(data->'filters'->'requiredHashtags', '[]'::jsonb))), '{}'::text[]),
  coalesce((data->'filters'->>'caseSensitive')::boolean, false),
  now(),
  now()
from public.curator_settings
where id = 'default';

delete from public.ai_settings;
insert into public.ai_settings (provider, model, updated_at)
select
  coalesce(nullif(data->'aiConfig'->>'provider', ''), 'gemini'),
  coalesce(nullif(data->'aiConfig'->>'model', ''), 'gemini-3.5-flash'),
  now()
from public.curator_settings
where id = 'default';

with legacy as (
  select value as target
  from public.curator_settings c
  cross join lateral jsonb_array_elements(coalesce(c.data->'destination'->'targets', '[]'::jsonb))
  where c.id = 'default'
)
insert into public.destination_targets
  (client_id, name, channel_id, enabled, status, error_message, created_at, updated_at)
select
  nullif(target->>'id', ''),
  coalesce(nullif(target->>'name', ''), nullif(target->>'channelId', ''), 'Telegram Target'),
  target->>'channelId',
  coalesce((target->>'enabled')::boolean, true),
  case
    when target->>'status' in ('idle','success','error') then target->>'status'
    else 'idle'
  end,
  nullif(target->>'errorMessage', ''),
  now(),
  now()
from legacy
where nullif(target->>'channelId', '') is not null
on conflict (client_id) where client_id is not null do update
set name = excluded.name,
    channel_id = excluded.channel_id,
    enabled = excluded.enabled,
    status = excluded.status,
    error_message = excluded.error_message,
    updated_at = now();

alter table public.source_channels validate constraint source_channels_status_check;
alter table public.destination_targets validate constraint destination_targets_status_check;
alter table public.posts validate constraint posts_status_check;
