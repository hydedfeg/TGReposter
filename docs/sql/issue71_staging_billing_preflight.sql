-- Issue #71 — TGReposter staging billing migration preflight (READ ONLY).
-- Run ONLY against Supabase project msmfilgdwuoymjhgtrmy.
-- No INSERT, UPDATE, DELETE, DDL, RPC or migration-history mutations.
-- Does NOT authorize billing launch, production migration, or ledger repair.

-- 1. Exact migration ledger identities. Positive and negative records should
-- match the audited runbook before any discussion of applying new migrations.
select version, name
from supabase_migrations.schema_migrations
where version in (
 '20261019133218', -- staged checkout rate-limit schema
 '20261019154000', -- different version in GitHub
 '20261019174232', -- staged atomic-capacity schema
 '20261019175500', -- different version in GitHub
 '20261021154000'  -- unapplied AI reconciliation backoff
)
order by version;

-- 2. Verify the old migrations are structurally present and the NEW one
-- is absent. Fail the rollout review if any finding contradicts expectation.
select
 to_regclass('public.billing_entitlement_enforcement') is not null
   as atomic_capacity_policy_table_present,
 to_regprocedure('public.enforce_billing_owner_resource_capacity()') is not null
   as atomic_capacity_function_present,
 to_regclass('public.billing_checkout_rate_limits') is not null
   as checkout_rate_limit_table_present,
 to_regclass('public.ai_usage_events') is not null as ai_usage_present,
 exists(
   select 1 from information_schema.columns
   where table_schema='public' and table_name='ai_usage_events'
      and column_name='reconciliation_attempts'
 ) as new_ai_backoff_column_present;

-- 3. Staging quota policy must stay OFF throughout acceptance.
select singleton,enabled as quota_enforcement_enabled
from public.billing_entitlement_enforcement;

-- 4. Compare exact trigger operation and target against the original
-- GitHub SQL file; disabled application policy does not disable the trigger.
select t.tgname,pg_get_triggerdef(t.oid,true) as definition,t.tgenabled
from pg_trigger t
join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and t.tgname in (
    'billing_capacity_source_channels',
    'billing_capacity_destination_targets',
    'billing_capacity_promotion_targets',
    'billing_capacity_promotion_campaigns'
  )
order by t.tgname;

-- 5. Inspect the actual SQL source in the active database to compare with
-- supabase/migrations/20261019175500_atomic_plan_capacity_guards.sql.
select pg_get_functiondef(
 'public.enforce_billing_owner_resource_capacity()'::regprocedure
) as source_definition;

-- 6. Check table columns, CHECK constraints, RLS and scoped privileges.
select c.relname,c.relrowsecurity,
 (select count(*)::integer
    from pg_attribute a
   where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
 ) as column_count,
 (select json_agg(json_build_object(
             'name',con.conname,
             'definition',pg_get_constraintdef(con.oid,true)
           ) order by con.conname)
    from pg_constraint con where con.conrelid=c.oid
 ) as constraints
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('billing_checkout_rate_limits',
                    'billing_entitlement_enforcement')
order by c.relname;

select
 has_function_privilege('anon',
   'public.enforce_billing_owner_resource_capacity()','EXECUTE')
   as anonymous_can_execute_quota_function,
 has_function_privilege('authenticated',
   'public.enforce_billing_owner_resource_capacity()','EXECUTE')
   as authenticated_can_execute_quota_function,
 has_function_privilege('service_role',
   'public.enforce_billing_owner_resource_capacity()','EXECUTE')
   as service_role_can_execute_quota_function,
 has_table_privilege('anon',
   'public.billing_checkout_rate_limits','SELECT')
   as anonymous_can_read_checkout_limits,
 has_table_privilege('authenticated',
   'public.billing_checkout_rate_limits','SELECT')
   as authenticated_can_read_checkout_limits,
 has_table_privilege('service_role',
   'public.billing_checkout_rate_limits','SELECT')
   as service_role_can_read_checkout_limits;

-- An exact migration reconciliation must also account for 23 historical
-- version mismatches and two staging-only corrective records. Consult
-- docs/STAGING_MIGRATION_LEDGER_RECONCILIATION.md before running any
-- Supabase CLI migration push/repair. Do not use this script on production.
