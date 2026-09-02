-- Scope Telegram destinations and bot credentials to the authenticated user.
-- Existing global destinations are assigned to the oldest configured super-admin
-- so the current production setup is preserved during the cutover.

alter table public.destination_targets
  add column if not exists owner_principal text;

do $$
declare
  initial_owner text;
  legacy_token text;
  user_secret_name text;
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

  -- Compatibility fallback for installations that still use the original owner
  -- username but do not yet have a populated profile row.
  if initial_owner is null then
    initial_owner := 'legacy:system_admin';
  end if;

  update public.destination_targets
  set owner_principal = initial_owner,
      updated_at = now()
  where owner_principal is null;

  select nullif(btrim(decrypted_secret), '')
  into legacy_token
  from vault.decrypted_secrets
  where name = 'tgreposter_main_bot_token'
  order by created_at desc
  limit 1;

  if legacy_token is not null then
    user_secret_name :=
      'tgreposter_destination_bot_' ||
      encode(digest(initial_owner, 'sha256'), 'hex');

    if not exists (
      select 1
      from vault.secrets
      where name = user_secret_name
    ) then
      perform vault.create_secret(
        legacy_token,
        user_secret_name,
        'User-scoped Telegram destination bot token',
        null
      );
    end if;
  end if;
end
$$;

drop index if exists public.destination_targets_client_id_key;

create unique index if not exists destination_targets_owner_client_id_key
  on public.destination_targets (owner_principal, client_id)
  where owner_principal is not null
    and client_id is not null;

create unique index if not exists destination_targets_legacy_client_id_key
  on public.destination_targets (client_id)
  where owner_principal is null
    and client_id is not null;

create index if not exists idx_destination_targets_owner_enabled
  on public.destination_targets (owner_principal, enabled, created_at)
  where owner_principal is not null;

comment on column public.destination_targets.owner_principal is
  'Server-derived destination owner key. Format is supabase:<auth-user-uuid> or legacy:<username>. Never accept this value from the browser.';

-- Destination rows are backend-owned. The browser accesses them only through
-- authenticated Express routes, which enforce owner_principal scoping.
alter table public.destination_targets enable row level security;
revoke all on table public.destination_targets from anon, authenticated;
grant select, insert, update, delete on table public.destination_targets to service_role;
