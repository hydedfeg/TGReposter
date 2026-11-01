-- Read-only validation for a disposable synthetic PostgreSQL restore.
\set ON_ERROR_STOP on
DO $verify$
DECLARE idx text; rls boolean; anon_reader boolean; auth_reader boolean;
BEGIN
  IF current_database() <> 'tgreposter_backoff_restore_test'
     OR current_setting('application_name',true) <> 'tgreposter-disposable-restore-test'
  THEN RAISE EXCEPTION 'Refusing to inspect anything but the disposable restore test'; END IF;
  IF (SELECT count(*) FROM public.billing_plans) <> 6
     OR (SELECT count(*) FROM public.billing_plans WHERE is_published) <> 0
  THEN RAISE EXCEPTION 'Unpublished catalog not preserved'; END IF;
  IF (SELECT count(*) FROM public.ai_usage_events) <> 2
     OR (SELECT count(*) FROM public.ai_usage_events WHERE status='pending') <> 1
     OR (SELECT count(*) FROM public.ai_usage_events WHERE status='success') <> 1
  THEN RAISE EXCEPTION 'AI usage data not preserved'; END IF;
  IF (SELECT count(*) FROM public.ai_usage_events WHERE owner_principal='legacy:pg-alice'
    AND reconciliation_attempts=1 AND reconciliation_next_attempt_at>now()) <> 1
     OR (SELECT count(*) FROM public.ai_usage_events WHERE owner_principal='legacy:pg-bob'
    AND reconciliation_attempts=0) <> 1
  THEN RAISE EXCEPTION 'Retry metadata or owner separation changed'; END IF;
  IF (SELECT count(*) FROM public.ai_unit_ledger) <> 1
     OR (SELECT sum(units_delta) FROM public.ai_unit_ledger) <> 20
     OR (SELECT count(*) FROM public.ai_unit_ledger WHERE owner_principal='legacy:pg-alice') <> 1
  THEN RAISE EXCEPTION 'Synthetic AI credit ledger changed'; END IF;
  IF (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ai_usage_events') <> 17
  THEN RAISE EXCEPTION 'Restored AI usage schema is incomplete'; END IF;
  SELECT indexdef INTO idx FROM pg_indexes WHERE schemaname='public'
    AND indexname='ai_usage_reconciliation_pending_due_idx';
  IF idx IS NULL OR position('reconciliation_next_attempt_at' in idx)=0
    OR position('provider_generation_id IS NOT NULL' in idx)=0
  THEN RAISE EXCEPTION 'Partial retry index lost'; END IF;
  IF NOT EXISTS (SELECT FROM pg_constraint WHERE
    conrelid='public.ai_usage_events'::regclass
    AND conname='ai_usage_reconciliation_attempts_nonnegative')
  THEN RAISE EXCEPTION 'Retry check constraint lost'; END IF;
  SELECT relrowsecurity,has_table_privilege('anon',oid,'SELECT'),
    has_table_privilege('authenticated',oid,'SELECT')
  INTO rls,anon_reader,auth_reader
  FROM pg_class WHERE oid='public.ai_usage_events'::regclass;
  IF NOT rls OR anon_reader OR auth_reader
  THEN RAISE EXCEPTION 'Usage RLS or client permissions weakened'; END IF;
END $verify$;
SELECT 'PASS: disposable PostgreSQL backup/restore preserved events, credits, schema and RLS' AS result;
