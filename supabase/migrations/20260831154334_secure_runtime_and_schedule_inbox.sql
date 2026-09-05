
create extension if not exists pg_net with schema extensions;

alter table public.source_channels enable row level security;
alter table public.filters enable row level security;
alter table public.destination_targets enable row level security;
alter table public.ai_settings enable row level security;
alter table public.posts enable row level security;
alter table public.curator_settings enable row level security;

revoke all on table public.source_channels from anon, authenticated;
revoke all on table public.filters from anon, authenticated;
revoke all on table public.destination_targets from anon, authenticated;
revoke all on table public.ai_settings from anon, authenticated;
revoke all on table public.posts from anon, authenticated;
revoke all on table public.curator_settings from anon, authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname in ('tgreposter-inbox-import', 'tgreposter-inbox-cleanup');

select cron.schedule(
  'tgreposter-inbox-import',
  '*/5 * * * *',
  $cron$
    select net.http_post(
      url := 'https://api.tgreposter.com/api/fetch-posts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'tgreposter_cron_secret'
          order by created_at desc
          limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cron$
);

select cron.schedule(
  'tgreposter-inbox-cleanup',
  '0 * * * *',
  $cron$
    delete from public.posts p
    where p.status in ('pending', 'archived')
      and coalesce(p.published_at, p.created_at) < now() - interval '24 hours'
      and not exists (
        select 1
        from public.promotion_campaign_posts campaign_post
        where campaign_post.post_id = p.id
      );
  $cron$
);

