-- Finalize per-user ownership for Promotion Campaign data.
-- Ship this migration with the owner-aware promotion backend. It makes tenant
-- ownership mandatory and prevents cross-owner references at the database layer.

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

  update public.telegram_bot_accounts
  set owner_principal = initial_owner
  where owner_principal is null;

  update public.promotion_campaigns
  set owner_principal = initial_owner
  where owner_principal is null;

  -- Child triggers derive owners from their parent, but explicitly repair any
  -- prepare/deploy race-window rows before NOT NULL is enforced.
  update public.promotion_targets target
  set owner_principal = account.owner_principal
  from public.telegram_bot_accounts account
  where target.bot_account_id = account.id
    and target.owner_principal is null;

  update public.promotion_campaign_posts campaign_post
  set owner_principal = campaign.owner_principal
  from public.promotion_campaigns campaign
  where campaign_post.campaign_id = campaign.id
    and campaign_post.owner_principal is null;

  update public.promotion_deliveries delivery
  set owner_principal = campaign_post.owner_principal
  from public.promotion_campaign_posts campaign_post
  where delivery.campaign_post_id = campaign_post.id
    and delivery.owner_principal is null;

  update public.promotion_delivery_attempts attempt
  set owner_principal = delivery.owner_principal
  from public.promotion_deliveries delivery
  where attempt.delivery_id = delivery.id
    and attempt.owner_principal is null;
end
$$;

alter table public.promotion_targets
  drop constraint if exists promotion_targets_bot_account_id_fkey,
  drop constraint if exists promotion_targets_bot_account_id_chat_id_key;

alter table public.promotion_campaign_posts
  drop constraint if exists promotion_campaign_posts_campaign_id_fkey,
  drop constraint if exists promotion_campaign_posts_campaign_id_post_id_key;

alter table public.promotion_deliveries
  drop constraint if exists promotion_deliveries_campaign_post_id_fkey,
  drop constraint if exists promotion_deliveries_target_id_fkey,
  drop constraint if exists promotion_deliveries_campaign_post_id_target_id_key;

alter table public.promotion_delivery_attempts
  drop constraint if exists promotion_delivery_attempts_delivery_id_fkey,
  drop constraint if exists promotion_delivery_attempts_delivery_id_attempt_number_key;

alter table public.telegram_bot_accounts
  drop constraint if exists telegram_bot_accounts_credential_ref_key,
  alter column owner_principal set not null;

alter table public.promotion_targets
  alter column owner_principal set not null;

alter table public.promotion_campaigns
  alter column owner_principal set not null;

alter table public.promotion_campaign_posts
  alter column owner_principal set not null;

alter table public.promotion_deliveries
  alter column owner_principal set not null;

alter table public.promotion_delivery_attempts
  alter column owner_principal set not null;

alter table public.telegram_bot_accounts
  add constraint telegram_bot_accounts_owner_id_key
    unique (owner_principal, id);

alter table public.promotion_targets
  add constraint promotion_targets_owner_id_key
    unique (owner_principal, id),
  add constraint promotion_targets_owner_bot_chat_key
    unique (owner_principal, bot_account_id, chat_id);

alter table public.promotion_campaigns
  add constraint promotion_campaigns_owner_id_key
    unique (owner_principal, id);

alter table public.promotion_campaign_posts
  add constraint promotion_campaign_posts_owner_id_key
    unique (owner_principal, id),
  add constraint promotion_campaign_posts_owner_campaign_post_key
    unique (owner_principal, campaign_id, post_id);

alter table public.promotion_deliveries
  add constraint promotion_deliveries_owner_id_key
    unique (owner_principal, id),
  add constraint promotion_deliveries_owner_campaign_target_key
    unique (owner_principal, campaign_post_id, target_id);

alter table public.promotion_delivery_attempts
  add constraint promotion_delivery_attempts_owner_delivery_attempt_key
    unique (owner_principal, delivery_id, attempt_number);

alter table public.promotion_targets
  add constraint promotion_targets_owner_bot_account_fkey
  foreign key (owner_principal, bot_account_id)
  references public.telegram_bot_accounts (owner_principal, id)
  on delete restrict
  not valid;

alter table public.promotion_campaign_posts
  add constraint promotion_campaign_posts_owner_campaign_fkey
  foreign key (owner_principal, campaign_id)
  references public.promotion_campaigns (owner_principal, id)
  on delete cascade
  not valid;

alter table public.promotion_deliveries
  add constraint promotion_deliveries_owner_campaign_post_fkey
  foreign key (owner_principal, campaign_post_id)
  references public.promotion_campaign_posts (owner_principal, id)
  on delete cascade
  not valid,
  add constraint promotion_deliveries_owner_target_fkey
  foreign key (owner_principal, target_id)
  references public.promotion_targets (owner_principal, id)
  on delete restrict
  not valid;

alter table public.promotion_delivery_attempts
  add constraint promotion_delivery_attempts_owner_delivery_fkey
  foreign key (owner_principal, delivery_id)
  references public.promotion_deliveries (owner_principal, id)
  on delete cascade
  not valid;

alter table public.promotion_targets
  validate constraint promotion_targets_owner_bot_account_fkey;

alter table public.promotion_campaign_posts
  validate constraint promotion_campaign_posts_owner_campaign_fkey;

alter table public.promotion_deliveries
  validate constraint promotion_deliveries_owner_campaign_post_fkey,
  validate constraint promotion_deliveries_owner_target_fkey;

alter table public.promotion_delivery_attempts
  validate constraint promotion_delivery_attempts_owner_delivery_fkey;

create index if not exists idx_promotion_targets_owner_bot
  on public.promotion_targets (owner_principal, bot_account_id);

create index if not exists idx_promotion_campaign_posts_owner_post
  on public.promotion_campaign_posts (owner_principal, post_id);

create index if not exists idx_promotion_deliveries_owner_campaign_post
  on public.promotion_deliveries (owner_principal, campaign_post_id);

create index if not exists idx_promotion_deliveries_owner_target
  on public.promotion_deliveries (owner_principal, target_id);

create index if not exists idx_promotion_delivery_attempts_owner_delivery
  on public.promotion_delivery_attempts (owner_principal, delivery_id);

comment on table public.telegram_bot_accounts is
  'Per-user server-side Telegram bot credential references for promotion campaigns.';
comment on table public.promotion_targets is
  'Per-user Telegram channels, groups, and supergroups eligible for campaign delivery.';
comment on table public.promotion_campaigns is
  'Per-user promotion campaign definitions.';
comment on table public.promotion_campaign_posts is
  'Per-user links between promotion campaigns and owner-scoped source posts.';
comment on table public.promotion_deliveries is
  'Per-user campaign delivery state for an owner-scoped campaign post and target.';
comment on table public.promotion_delivery_attempts is
  'Per-user immutable delivery attempt history.';

alter table public.telegram_bot_accounts enable row level security;
alter table public.promotion_targets enable row level security;
alter table public.promotion_campaigns enable row level security;
alter table public.promotion_campaign_posts enable row level security;
alter table public.promotion_deliveries enable row level security;
alter table public.promotion_delivery_attempts enable row level security;

revoke all on table public.telegram_bot_accounts from anon, authenticated;
revoke all on table public.promotion_targets from anon, authenticated;
revoke all on table public.promotion_campaigns from anon, authenticated;
revoke all on table public.promotion_campaign_posts from anon, authenticated;
revoke all on table public.promotion_deliveries from anon, authenticated;
revoke all on table public.promotion_delivery_attempts from anon, authenticated;

grant select, insert, update, delete on table public.telegram_bot_accounts to service_role;
grant select, insert, update, delete on table public.promotion_targets to service_role;
grant select, insert, update, delete on table public.promotion_campaigns to service_role;
grant select, insert, update, delete on table public.promotion_campaign_posts to service_role;
grant select, insert, update, delete on table public.promotion_deliveries to service_role;
grant select, insert, update, delete on table public.promotion_delivery_attempts to service_role;
