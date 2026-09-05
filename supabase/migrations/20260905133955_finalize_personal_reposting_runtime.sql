-- Finalize per-user ownership for monitoring, reposting, and Content Inbox data.
-- This migration must ship with the owner-aware backend because it replaces the
-- legacy globally unique post/channel identifiers with per-owner identifiers.

set lock_timeout = '5s';

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

  alter table public.posts
    add column if not exists owner_principal text;

  update public.posts
  set owner_principal = initial_owner
  where owner_principal is null;

  update public.source_channels
  set owner_principal = initial_owner
  where owner_principal is null;

  update public.filters
  set owner_principal = initial_owner
  where owner_principal is null;

  update public.ai_settings
  set owner_principal = initial_owner
  where owner_principal is null;

  update public.destination_targets
  set owner_principal = initial_owner
  where owner_principal is null;
end
$$;

-- Temporarily remove post references so one legacy canonical row can be copied
-- to every owner that already has workflow or campaign state for that post.
alter table public.user_inbox_items
  drop constraint if exists user_inbox_items_post_id_fkey;

alter table public.promotion_campaign_posts
  drop constraint if exists promotion_campaign_posts_post_id_fkey;

alter table public.posts
  drop constraint if exists posts_pkey;

with required_owner_posts as (
  select ui.owner_principal, ui.post_id
  from public.user_inbox_items ui
  union
  select cp.owner_principal, cp.post_id
  from public.promotion_campaign_posts cp
  where cp.owner_principal is not null
)
insert into public.posts (
  owner_principal,
  id,
  channel_username,
  original_text,
  edited_text,
  photo_url,
  telegram_url,
  status,
  published_at,
  created_at,
  media_type,
  video_url,
  updated_at,
  posted_at,
  error_message,
  inbox_default_status
)
select
  required.owner_principal,
  source_post.id,
  source_post.channel_username,
  source_post.original_text,
  source_post.edited_text,
  source_post.photo_url,
  source_post.telegram_url,
  source_post.status,
  source_post.published_at,
  source_post.created_at,
  source_post.media_type,
  source_post.video_url,
  source_post.updated_at,
  source_post.posted_at,
  source_post.error_message,
  source_post.inbox_default_status
from required_owner_posts required
join public.posts source_post
  on source_post.id = required.post_id
where source_post.owner_principal <> required.owner_principal;

alter table public.posts
  alter column owner_principal set not null,
  add constraint posts_pkey primary key (owner_principal, id);

alter table public.user_inbox_items
  add constraint user_inbox_items_post_id_fkey
  foreign key (owner_principal, post_id)
  references public.posts (owner_principal, id)
  on delete cascade
  not valid;

alter table public.user_inbox_items
  validate constraint user_inbox_items_post_id_fkey;

alter table public.promotion_campaign_posts
  add constraint promotion_campaign_posts_post_id_fkey
  foreign key (owner_principal, post_id)
  references public.posts (owner_principal, id)
  on delete restrict
  not valid;

alter table public.promotion_campaign_posts
  validate constraint promotion_campaign_posts_post_id_fkey;

-- Monitoring configuration and repost destinations are now mandatory per-user
-- data. Global compatibility uniqueness is removed after the backend cutover.
alter table public.source_channels
  drop constraint if exists source_channels_username_key,
  alter column owner_principal set not null;

alter table public.filters
  alter column owner_principal set not null;

alter table public.ai_settings
  alter column owner_principal set not null;

alter table public.destination_targets
  alter column owner_principal set not null;

drop index if exists public.destination_targets_client_id_key;
drop index if exists public.destination_targets_legacy_client_id_key;

create index if not exists idx_posts_owner_published
  on public.posts (owner_principal, published_at desc, created_at desc);

create index if not exists idx_posts_owner_status
  on public.posts (owner_principal, inbox_default_status, published_at desc);

comment on column public.posts.owner_principal is
  'Server-derived owner for this user Telegram source post.';

comment on table public.posts is
  'Per-user Telegram source posts. The same Telegram post ID may exist independently for multiple owners.';

comment on table public.user_inbox_items is
  'Per-user Content Inbox workflow state linked to an owner-scoped Telegram post.';

alter table public.posts enable row level security;
revoke all on table public.posts from anon, authenticated;
grant select, insert, update, delete on table public.posts to service_role;

-- Retain approved, published, and campaign-linked history independently for
-- each owner while deleting expired pending/archive rows after 24 hours.
select cron.unschedule(jobid)
from cron.job
where jobname = 'tgreposter-inbox-cleanup';

select cron.schedule(
  'tgreposter-inbox-cleanup',
  '0 * * * *',
  $cron$
    delete from public.posts p
    where coalesce(p.published_at, p.created_at) < now() - interval '24 hours'
      and not exists (
        select 1
        from public.user_inbox_items ui
        where ui.owner_principal = p.owner_principal
          and ui.post_id = p.id
          and ui.status in ('approved', 'posted')
      )
      and not exists (
        select 1
        from public.promotion_campaign_posts campaign_post
        where campaign_post.owner_principal = p.owner_principal
          and campaign_post.post_id = p.id
      );
  $cron$
);
