-- STAGING RESTORE PROVENANCE: READ ONLY. No customer content leaves the database.
WITH objects AS (
SELECT 'relation' kind,n.nspname||'.'||c.relname object_key,
concat_ws('|',c.relkind,c.relpersistence,c.relrowsecurity,c.relforcerowsecurity,
 coalesce(pg_get_viewdef(c.oid,true),''),
 coalesce((select string_agg(format('%s:%s:%s:%s:%s',a.attname,
   format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,
   coalesce(pg_get_expr(d.adbin,d.adrelid),'')),';' order by a.attnum)
   from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
   where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),'')) definition
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p','v','m','f')
union all
select 'index',n.nspname||'.'||idx.relname,pg_get_indexdef(i.indexrelid)
from pg_index i join pg_class idx on idx.oid=i.indexrelid
join pg_class t on t.oid=i.indrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='public'
union all
select 'constraint',n.nspname||'.'||tbl.relname||'.'||co.conname,pg_get_constraintdef(co.oid,true)
from pg_constraint co join pg_class tbl on tbl.oid=co.conrelid
join pg_namespace n on n.oid=tbl.relnamespace where n.nspname='public'
union all
select 'policy',n.nspname||'.'||c.relname||'.'||p.polname,
concat_ws('|',p.polcmd,p.polpermissive,coalesce(pg_get_expr(p.polqual,p.polrelid),''),
 coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''),coalesce(array_to_string(p.polroles,','),'')) 
from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
union all
select 'function',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind in ('f','p')
union all
select 'trigger',n.nspname||'.'||c.relname||'.'||t.tgname,pg_get_triggerdef(t.oid,true)
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and not t.tgisinternal
), f AS (
select kind,count(*)::integer object_count,
md5(coalesce(string_agg(object_key||E'\t'||definition,E'\n' order by object_key),'')) fingerprint
from objects group by kind
)
SELECT jsonb_build_object(
 'postgresMajor', current_setting('server_version_num')::integer/10000,
 'schemaFingerprints',(select jsonb_object_agg(kind,jsonb_build_object('count',object_count,'md5',fingerprint)) from f),
 'migrationLedger',(select coalesce(jsonb_agg(jsonb_build_object('version',version,'name',name,
    'statementCount',cardinality(statements),'firstStatementMd5',md5(coalesce(statements[1],'')))
    order by version),'[]'::jsonb) from supabase_migrations.schema_migrations),
 'commercial',jsonb_build_object(
  'plans',(select count(*) from public.billing_plans),
  'publishedPlans',(select count(*) from public.billing_plans where is_published),
  'subscriptionOrders',(select count(*) from public.billing_subscription_orders),
  'topupOrders',(select count(*) from public.billing_ai_topup_orders),
  'aiUsageRows',(select count(*) from public.ai_usage_events),
  'aiLedgerRows',(select count(*) from public.ai_unit_ledger),
  'entitlementEnforced',(select enabled from public.billing_entitlement_enforcement),
  'backoffColumns',(select count(*) from information_schema.columns where table_schema='public'
     and table_name='ai_usage_events' and column_name in ('reconciliation_attempts','reconciliation_next_attempt_at'))
 )) AS audit_payload;