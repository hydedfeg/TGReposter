-- Move the primary reposting bot credential out of legacy JSON and into Supabase Vault.
-- Idempotent: an existing Vault credential is preserved and the legacy copy is
-- cleared only when the Vault secret exists.

do $$
declare
  legacy_token text;
begin
  select nullif(data #>> '{destination,botToken}', '')
  into legacy_token
  from public.curator_settings
  where id = 'default';

  if legacy_token is not null
     and not exists (
       select 1
       from vault.secrets
       where name = 'tgreposter_main_bot_token'
     )
  then
    perform vault.create_secret(
      legacy_token,
      'tgreposter_main_bot_token',
      'Primary Telegram reposting bot token',
      null
    );
  end if;

  if exists (
    select 1
    from vault.secrets
    where name = 'tgreposter_main_bot_token'
  )
  then
    update public.curator_settings
    set data = jsonb_set(
          data,
          '{destination,botToken}',
          to_jsonb(''::text),
          true
        ),
        updated_at = now()
    where id = 'default'
      and nullif(data #>> '{destination,botToken}', '') is not null;
  end if;
end
$$;
