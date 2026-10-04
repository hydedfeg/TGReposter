-- Public landing-page demo leads are written only by the backend PostgreSQL
-- connection. Browser roles receive no direct table access.
create table if not exists public.demo_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  company text,
  telegram_username text,
  use_case text not null,
  message text,
  locale text not null default 'en',
  source text not null default 'landing_page',
  status text not null default 'new',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint demo_requests_full_name_length check (char_length(full_name) between 2 and 100),
  constraint demo_requests_email_length check (char_length(email) between 3 and 254),
  constraint demo_requests_company_length check (company is null or char_length(company) <= 120),
  constraint demo_requests_telegram_username_length check (telegram_username is null or char_length(telegram_username) <= 64),
  constraint demo_requests_message_length check (message is null or char_length(message) <= 1200),
  constraint demo_requests_use_case_check check (use_case = any (array['curation'::text, 'campaigns'::text, 'both'::text, 'other'::text])),
  constraint demo_requests_locale_check check (locale = any (array['en'::text, 'ru'::text, 'ar'::text, 'fa'::text])),
  constraint demo_requests_source_check check (source = 'landing_page'),
  constraint demo_requests_status_check check (status = any (array['new'::text, 'contacted'::text, 'approved'::text, 'rejected'::text]))
);

create index if not exists demo_requests_created_at_idx
  on public.demo_requests (created_at desc);

create index if not exists demo_requests_status_created_at_idx
  on public.demo_requests (status, created_at desc);

create index if not exists demo_requests_email_created_at_idx
  on public.demo_requests (lower(email), created_at desc);

alter table public.demo_requests enable row level security;

revoke all on table public.demo_requests from anon, authenticated;

comment on table public.demo_requests is
  'Landing-page demo access requests. Backend-owned; not directly readable or writable by browser roles.';
