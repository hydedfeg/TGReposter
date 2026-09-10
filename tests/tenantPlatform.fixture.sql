-- Test-only stand-ins for Supabase-managed infrastructure. Application tables,
-- ownership constraints, grants and policies come from the real migrations.
-- Vault here stores FAKE test tokens only; encryption and hosted Auth are not tested.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema extensions;
create schema vault;
create schema cron;
create table auth.users (
  id uuid primary key, email text, raw_user_meta_data jsonb default '{}'
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema public, auth to anon, authenticated, service_role;
create table vault.secrets (
  id uuid primary key default gen_random_uuid(), name text unique,
  secret text, description text, created_at timestamptz default now()
);
create view vault.decrypted_secrets as select *, secret as decrypted_secret from vault.secrets;
create function vault.create_secret(text, text, text, uuid default null)
returns uuid language sql as $$
  insert into vault.secrets(secret,name,description) values ($1,$2,$3) returning id
$$;
create function vault.update_secret(uuid,text,text,text,uuid default null)
returns void language sql as $$
  update vault.secrets set secret=$2,name=$3,description=$4 where id=$1
$$;
create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text);
create function cron.unschedule(bigint) returns boolean language sql as $$
  delete from cron.job where jobid=$1 returning true
$$;
create function cron.schedule(text,text,text) returns bigint language sql as $$
  insert into cron.job(jobname,schedule,command) values($1,$2,$3)
  on conflict(jobname) do update set schedule=$2,command=$3 returning jobid
$$;
