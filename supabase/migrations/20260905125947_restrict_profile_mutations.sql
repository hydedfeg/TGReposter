-- Keep TGReposter authorization fields backend-owned.
--
-- public.profiles is consulted by the Express authentication middleware for
-- role and activation decisions. Browser roles therefore need read access to
-- their own row, but must never be able to insert, update, or delete profiles.

alter table public.profiles enable row level security;

drop policy if exists "Users can update own profile" on public.profiles;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles
  for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.uid()) = id
  );

-- Remove table privileges inherited from the original schema migration. RLS
-- controls which rows are visible, while these grants control which operations
-- browser roles may attempt at all.
revoke all privileges on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;

-- Account provisioning and role/activation changes continue through trusted
-- backend and Auth trigger paths only.
grant select, insert, update, delete on table public.profiles to service_role;

comment on table public.profiles is
  'TGReposter identity and RBAC records. Client roles may read only their own row; mutations are backend-owned.';
