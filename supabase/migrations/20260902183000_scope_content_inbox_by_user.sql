-- Give every authenticated user a private Content Inbox workflow while
-- keeping Telegram source collection deduplicated in public.posts.
--
-- public.posts remains the canonical source-content store.
-- public.user_inbox_items stores only user-owned workflow state: draft text,
-- review status, publish timestamp, and delivery error.

alter table public.posts
  add column if not exists inbox_default_status text not null default 'pending';

update public.posts
set inbox_default_status =
  case
    when status = 'archived' then 'archived'
    else 'pending'
  end
where inbox_default_status is distinct from
  case
    when status = 'archived' then 'archived'
    else 'pending'
  end;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.posts'::regclass
      and conname = 'posts_inbox_default_status_check'
  ) then
    alter table public.posts
      add constraint posts_inbox_default_status_check
      check (inbox_default_status in ('pending', 'archived')) not valid;
  end if;
end
$$;

alter table public.posts
  validate constraint posts_inbox_default_status_check;

create table if not exists public.user_inbox_items (
  owner_principal text not null,
  post_id text not null references public.posts(id) on delete cascade,
  edited_text text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'posted', 'archived')),
  posted_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_principal, post_id)
);

create index if not exists idx_user_inbox_owner_status
  on public.user_inbox_items (owner_principal, status, updated_at desc);

create index if not exists idx_user_inbox_post
  on public.user_inbox_items (post_id);

comment on table public.user_inbox_items is
  'Per-user Content Inbox workflow overlay. Canonical Telegram source content remains in public.posts.';

comment on column public.user_inbox_items.owner_principal is
  'Server-derived owner key: supabase:<auth-user-uuid> or legacy:<username>.';

-- Preserve the current production owner's existing edits, moderation state,
-- publishing history, and error state during the cutover. Other users receive
-- independent default states from the canonical source post.
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

  insert into public.user_inbox_items
    (owner_principal, post_id, edited_text, status, posted_at, error_message, created_at, updated_at)
  select
    initial_owner,
    p.id,
    coalesce(p.edited_text, p.original_text),
    case
      when p.status in ('pending', 'approved', 'posted', 'archived') then p.status
      else p.inbox_default_status
    end,
    p.posted_at,
    p.error_message,
    coalesce(p.created_at, now()),
    coalesce(p.updated_at, now())
  from public.posts p
  on conflict (owner_principal, post_id) do nothing;
end
$$;

alter table public.user_inbox_items enable row level security;
revoke all on table public.user_inbox_items from anon, authenticated;
grant select, insert, update, delete on table public.user_inbox_items to service_role;

-- Replace the old cleanup policy. A source post can be deleted after the
-- rolling 24-hour review window only when no user needs it for approved or
-- published history and no promotion campaign references it.
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
        where ui.post_id = p.id
          and ui.status in ('approved', 'posted')
      )
      and not exists (
        select 1
        from public.promotion_campaign_posts campaign_post
        where campaign_post.post_id = p.id
      );
  $cron$
);
