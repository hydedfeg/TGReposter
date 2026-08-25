-- Promotion campaign schema
--
-- Security model:
-- - Promotion data is backend-only at this stage.
-- - RLS is enabled on every new public table.
-- - anon/authenticated receive no table privileges.
-- - raw Telegram bot tokens are never stored here; only backend credential references.

create table if not exists public.telegram_bot_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) > 0),
  bot_username text,
  credential_source text not null default 'environment'
    check (credential_source in ('legacy_settings', 'environment', 'vault')),
  credential_ref text not null unique check (char_length(btrim(credential_ref)) > 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.telegram_bot_accounts.credential_ref is
  'Reference to a backend-controlled Telegram bot credential. Never store the raw bot token in this column.';

create table if not exists public.promotion_targets (
  id uuid primary key default gen_random_uuid(),
  bot_account_id uuid not null references public.telegram_bot_accounts(id) on delete restrict,
  name text not null check (char_length(btrim(name)) > 0),
  chat_id text not null check (char_length(btrim(chat_id)) > 0),
  chat_type text check (chat_type in ('channel', 'group', 'supergroup')),
  enabled boolean not null default true,
  connection_status text not null default 'unknown'
    check (connection_status in ('unknown', 'ok', 'error')),
  last_checked_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bot_account_id, chat_id)
);

create table if not exists public.promotion_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) > 0),
  description text,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'running', 'completed', 'partial', 'failed', 'cancelled')),
  created_by_username text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.promotion_campaign_posts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.promotion_campaigns(id) on delete cascade,
  post_id text not null references public.posts(id) on delete restrict,
  content_mode text not null default 'original'
    check (content_mode in ('original', 'teaser', 'ai', 'custom')),
  promotion_text text,
  cta_text text,
  source_link_override text,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, post_id)
);

create table if not exists public.promotion_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_post_id uuid not null references public.promotion_campaign_posts(id) on delete cascade,
  target_id uuid not null references public.promotion_targets(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'success', 'failed', 'skipped')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  telegram_message_id bigint,
  warning_message text,
  error_message text,
  last_attempt_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_post_id, target_id)
);

create table if not exists public.promotion_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.promotion_deliveries(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  outcome text not null check (outcome in ('success', 'failed', 'warning')),
  telegram_message_id bigint,
  telegram_error_code integer,
  warning_message text,
  error_message text,
  attempted_at timestamptz not null default now(),
  unique (delivery_id, attempt_number)
);

create index if not exists idx_promotion_targets_bot_account
  on public.promotion_targets (bot_account_id);
create index if not exists idx_promotion_targets_enabled
  on public.promotion_targets (enabled) where enabled = true;
create index if not exists idx_promotion_campaigns_status_created
  on public.promotion_campaigns (status, created_at desc);
create index if not exists idx_promotion_campaign_posts_campaign_position
  on public.promotion_campaign_posts (campaign_id, position, created_at);
create index if not exists idx_promotion_campaign_posts_post_id
  on public.promotion_campaign_posts (post_id);
create index if not exists idx_promotion_deliveries_status
  on public.promotion_deliveries (status);
create index if not exists idx_promotion_deliveries_target_status
  on public.promotion_deliveries (target_id, status);
create index if not exists idx_promotion_delivery_attempts_delivery
  on public.promotion_delivery_attempts (delivery_id, attempt_number desc);

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
