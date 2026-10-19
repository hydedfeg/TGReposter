-- PostgreSQL-enforced, owner-serialized entitlement limits.
-- OFF by default. No existing workspace row or subscription is mutated.
-- Activate separately ONLY after reviewing legacy writers and commercial policy.
create table public.billing_entitlement_enforcement (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.billing_entitlement_enforcement(singleton,enabled)
values(true,false) on conflict(singleton) do nothing;
alter table public.billing_entitlement_enforcement enable row level security;
revoke all on public.billing_entitlement_enforcement from public,anon,authenticated;
grant select,insert,update,delete on public.billing_entitlement_enforcement to service_role;

create or replace function public.enforce_billing_owner_resource_capacity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  policy_enabled boolean;
  owner_key text;
  changed_to_active boolean;
  resource text;
  effective_plan text;
  limit_value integer;
  used integer;
begin
  -- Even backend data-repair jobs pass through this trigger once enabled.
  select enabled into policy_enabled from public.billing_entitlement_enforcement
  where singleton=true;
  if not found then
    raise exception using errcode='PZ500',
      message='Billing entitlement configuration is unavailable.';
  end if;
  if not policy_enabled then return new; end if;

  owner_key:=new.owner_principal;
  if owner_key is null or btrim(owner_key)='' then
    raise exception using errcode='PZ500',
      message='Billing resource owner is unavailable.';
  end if;

  if tg_table_name='promotion_campaigns' then
    resource:='active_campaigns';
    changed_to_active:=new.status in ('ready','running') and
      (tg_op='INSERT' or old.status not in ('ready','running') or
       old.owner_principal is distinct from new.owner_principal);
  elsif tg_table_name='source_channels' then
    resource:='sources';
    changed_to_active:=new.enabled is true and
      (tg_op='INSERT' or old.enabled is distinct from true or
       old.owner_principal is distinct from new.owner_principal);
  elsif tg_table_name in ('destination_targets','promotion_targets') then
    resource:='destinations';
    changed_to_active:=new.enabled is true and
      (tg_op='INSERT' or old.enabled is distinct from true or
       old.owner_principal is distinct from new.owner_principal);
  else
    raise exception using errcode='PZ500',message='Unknown billing resource.';
  end if;

  -- Updates to an already-active resource, disables and deletes are allowed.
  if not changed_to_active then return new; end if;

  -- The SAME lock is used for personal and promotion destinations. Every
  -- transaction that increases a given owner's capacity serializes here.
  perform pg_advisory_xact_lock(hashtextextended(
    'TGReposter.billing.capacity:'||owner_key, 20261019));

  -- Read an authoritative DB snapshot AFTER acquiring the transaction lock.
  select b.plan_id into effective_plan
  from public.billing_subscriptions b
  where b.owner_principal=owner_key and b.status='active'
    and b.current_period_start<=now()
    and b.current_period_end>now()
  order by b.current_period_end desc
  limit 1;
  effective_plan:=coalesce(effective_plan,'free');

  select case resource
    when 'sources' then p.max_sources
    when 'destinations' then p.max_destinations
    when 'active_campaigns' then p.max_active_campaigns
    end into limit_value
  from public.billing_plans p where p.id=effective_plan;
  if not found then
    raise exception using errcode='PZ500',
      message='Billing plan limit configuration is unavailable.';
  end if;
  if limit_value is null then return new; end if;

  if resource='sources' then
    select count(*)::integer into used from public.source_channels
    where owner_principal=owner_key and enabled=true;
  elsif resource='destinations' then
    select (select count(*)::integer from public.destination_targets
      where owner_principal=owner_key and enabled=true)
      + (select count(*)::integer from public.promotion_targets
         where owner_principal=owner_key and enabled=true)
    into used;
  else
    select count(*)::integer into used from public.promotion_campaigns
    where owner_principal=owner_key and status in ('ready','running');
  end if;

  -- AFTER triggers count the current candidate row. A rejected statement
  -- rolls back its own mutation; no partial entitlement grant is persisted.
  if used>limit_value then
    raise exception using errcode='PZ409',
      message='Current subscription plan capacity reached.';
  end if;
  return new;
end
$function$;

revoke all on function public.enforce_billing_owner_resource_capacity()
  from public,anon,authenticated;
grant execute on function public.enforce_billing_owner_resource_capacity()
  to service_role;

create trigger billing_capacity_source_channels
after insert or update of enabled,owner_principal
on public.source_channels for each row
execute function public.enforce_billing_owner_resource_capacity();

create trigger billing_capacity_destination_targets
after insert or update of enabled,owner_principal
on public.destination_targets for each row
execute function public.enforce_billing_owner_resource_capacity();

create trigger billing_capacity_promotion_targets
after insert or update of enabled,owner_principal
on public.promotion_targets for each row
execute function public.enforce_billing_owner_resource_capacity();

create trigger billing_capacity_promotion_campaigns
after insert or update of status,owner_principal
on public.promotion_campaigns for each row
execute function public.enforce_billing_owner_resource_capacity();

comment on table public.billing_entitlement_enforcement is
  'Backend-only enablement of atomic billing plan capacity triggers. Disabled until authorized.';
