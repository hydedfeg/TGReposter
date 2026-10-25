-- Only local disposable PostgreSQL, never staging or production.
\set ON_ERROR_STOP on
DO $guard$ BEGIN
 IF current_database()<>'tgreposter_backoff_rehearsal'
    OR current_setting('application_name',true)<>'tgreposter-disposable-backoff-test'
 THEN RAISE EXCEPTION 'Refusing SQL outside the disposable local database'; END IF;
END $guard$;
DO $roles$ BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $roles$;

-- Relevant real source migrations, not a complete live database restore.
\ir ../../supabase/migrations/20261012144506_create_commercial_foundation.sql
\ir ../../supabase/migrations/20261012144528_add_ai_usage_reconciliation.sql

DO $baseline$ BEGIN
 IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
     AND table_name='ai_usage_events')<>15
 OR (SELECT count(*) FROM pg_indexes WHERE schemaname='public'
     AND tablename='ai_usage_events')<>5
 OR (SELECT count(*) FROM pg_constraint WHERE conrelid='public.ai_usage_events'::regclass AND contype<>'n')<>10
 THEN RAISE EXCEPTION 'Baseline differs from audited staging structure'; END IF;
END $baseline$;

INSERT INTO public.ai_usage_events(owner_principal,request_key,operation,model_id,
 status,provider_generation_id,reconciliation_note,created_at)
VALUES ('legacy:pg-alice','pg-rehearsal-alice','rewrite','openrouter/fake','pending',
        'gen-pg-alice','AI_USAGE_UNVERIFIED',now()-interval '3 minutes'),
       ('legacy:pg-bob','pg-rehearsal-bob','translate','openrouter/fake','success',
        'gen-pg-bob','RESOLVED',now()-interval '3 minutes');
INSERT INTO public.ai_unit_ledger(owner_principal,event_key,balance_type,event_kind,units_delta)
VALUES ('legacy:pg-alice','pg-rehearsal-grant','purchased','grant',20);
CREATE TEMP TABLE snapshot_usage AS SELECT owner_principal,request_key,status,
 units_charged FROM public.ai_usage_events;
CREATE TEMP TABLE snapshot_ledger AS SELECT owner_principal,event_key,
 balance_type,event_kind,units_delta FROM public.ai_unit_ledger;

-- Transaction rollback: undo SQL entirely before reapplying in shadow DB.
BEGIN;
\ir ../../supabase/migrations/20261021154000_ai_reconciliation_backoff.sql
DO $test_in_transaction$ BEGIN
 IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
   AND table_name='ai_usage_events' AND column_name IN
   ('reconciliation_attempts','reconciliation_next_attempt_at'))<>2
 THEN RAISE EXCEPTION 'Missing new columns within transaction'; END IF;
END $test_in_transaction$;
ROLLBACK;

DO $verify_rollback$ BEGIN
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
   AND table_name='ai_usage_events' AND column_name='reconciliation_attempts')
 OR EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public'
   AND indexname='ai_usage_reconciliation_pending_due_idx')
 THEN RAISE EXCEPTION 'Migration rollback leaked DDL'; END IF;
 IF (SELECT count(*) FROM public.ai_usage_events)<>2 OR
    (SELECT sum(units_delta) FROM public.ai_unit_ledger)<>20
 THEN RAISE EXCEPTION 'Migration rollback changed tenant balances'; END IF;
END $verify_rollback$;

BEGIN;
\ir ../../supabase/migrations/20261021154000_ai_reconciliation_backoff.sql
COMMIT;

DO $verify_commit$
DECLARE idx text; rls boolean; anon_read boolean; user_read boolean; denied boolean:=false;
BEGIN
 IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
    AND table_name='ai_usage_events')<>17
 OR (SELECT count(*) FROM pg_indexes WHERE schemaname='public'
    AND tablename='ai_usage_events')<>6
 OR (SELECT count(*) FROM pg_constraint WHERE conrelid='public.ai_usage_events'::regclass AND contype<>'n')<>11
 THEN RAISE EXCEPTION 'Expected backoff metadata/constraint/index not found'; END IF;
 SELECT indexdef INTO idx FROM pg_indexes
  WHERE schemaname='public' AND indexname='ai_usage_reconciliation_pending_due_idx';
 IF idx IS NULL OR position('reconciliation_next_attempt_at' in idx)=0
    OR position('provider_generation_id IS NOT NULL' in idx)=0
 THEN RAISE EXCEPTION 'Backoff index predicate invalid'; END IF;
 SELECT relrowsecurity,has_table_privilege('anon',oid,'SELECT'),
   has_table_privilege('authenticated',oid,'SELECT')
 INTO rls,anon_read,user_read FROM pg_class
 WHERE oid='public.ai_usage_events'::regclass;
 IF NOT rls OR anon_read OR user_read THEN RAISE EXCEPTION 'RLS/grants weakened'; END IF;
 BEGIN
  UPDATE public.ai_usage_events SET reconciliation_attempts=-1
   WHERE owner_principal='legacy:pg-alice';
 EXCEPTION WHEN check_violation THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Negative retry counter accepted'; END IF;
 IF (SELECT count(*) FROM public.ai_usage_events WHERE reconciliation_attempts<>0)<>0
 THEN RAISE EXCEPTION 'Existing events lost zero default'; END IF;
END $verify_commit$;

-- Simulated claim/backoff, never calls OpenRouter or changes credit ledger.
WITH claimed AS (
 UPDATE public.ai_usage_events SET
   reconciliation_attempts=reconciliation_attempts+1,
   reconciliation_next_attempt_at=now()+interval '2 minutes'
 WHERE owner_principal='legacy:pg-alice' AND status='pending'
   AND provider_generation_id IS NOT NULL
   AND reconciliation_next_attempt_at IS NULL
 RETURNING id
) SELECT count(*) AS claimed_count FROM claimed;
DO $verify_final$ BEGIN
 IF (SELECT reconciliation_attempts FROM public.ai_usage_events
      WHERE owner_principal='legacy:pg-alice')<>1
 OR NOT (SELECT reconciliation_next_attempt_at>now()
      FROM public.ai_usage_events WHERE owner_principal='legacy:pg-alice')
 OR (SELECT reconciliation_attempts FROM public.ai_usage_events
      WHERE owner_principal='legacy:pg-bob')<>0
 THEN RAISE EXCEPTION 'Retry backoff or owner isolation changed'; END IF;
 IF EXISTS (
   (SELECT owner_principal,event_key,balance_type,event_kind,units_delta
    FROM public.ai_unit_ledger EXCEPT SELECT * FROM snapshot_ledger)
   UNION ALL
   (SELECT * FROM snapshot_ledger EXCEPT SELECT owner_principal,event_key,
    balance_type,event_kind,units_delta FROM public.ai_unit_ledger)
 ) THEN RAISE EXCEPTION 'AI ledger changed'; END IF;
END $verify_final$;
SELECT 'PASS: real PostgreSQL transactional backoff migration rehearsal' AS result;
