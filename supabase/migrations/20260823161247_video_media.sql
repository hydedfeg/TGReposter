alter table public.posts
  add column if not exists media_type text,
  add column if not exists video_url text;

alter table public.posts
  drop constraint if exists posts_media_type_check;

alter table public.posts
  add constraint posts_media_type_check
  check (media_type is null or media_type in ('photo', 'video'));
