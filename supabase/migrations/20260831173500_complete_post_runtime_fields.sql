alter table public.posts
  add column if not exists posted_at timestamptz,
  add column if not exists error_message text;

create index if not exists idx_posts_posted_at
  on public.posts (posted_at desc)
  where status = 'posted';
