-- Packaged manually with user approval because the Supabase CLI is unavailable
-- in this execution environment.
--
-- Each deployed environment can set `tgreposter_app_url` in Supabase Vault.
-- Production keeps the existing API URL as a safe fallback when the optional
-- environment-specific value has not been configured.

begin;
set local lock_timeout = '5s';

select cron.unschedule(jobid)
from cron.job
where jobname = 'tgreposter-inbox-import';

select cron.schedule(
  'tgreposter-inbox-import',
  '*/5 * * * *',
  $cron$
    select net.http_post(
      url := coalesce(
        (
          select nullif(rtrim(btrim(decrypted_secret), '/'), '')
          from vault.decrypted_secrets
          where name = 'tgreposter_app_url'
          order by created_at desc
          limit 1
        ),
        'https://api.tgreposter.com'
      ) || '/api/fetch-posts',
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

commit;
