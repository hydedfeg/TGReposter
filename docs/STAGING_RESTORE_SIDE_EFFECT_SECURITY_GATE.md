# Staging restored-database side-effect security gate

Date: October 27, 2026. Scope: staging only; no live database schema/config changes.

## Read-only staging findings

- PostgreSQL 17.6; 38 public tables with RLS enabled on all; 37 deliberately have no RLS policies. One authenticated user-profile SELECT policy restricts reads by the logged-in user ID.
- Neither anon nor ordinary authenticated roles have direct data privileges on billing, crypto-payment, AI Unit ledger, source or destination tables. Public SECURITY DEFINER functions are not executable by anon.
- Extensions pg_cron and pg_net are installed. There are **two active cron jobs** on the actual staging database, **one with an outbound HTTP call**. At inspection, the pg_net request queue was empty.
- Supabase Auth security advisor flags leaked-password protection as disabled; consider enabling after a separate configuration review. The 37 no-policy RLS notices are informational under intentional backend-only access.
- The performance advisor reports unindexed foreign keys and unused indexes. No index changes have been made.

## Added private restore safety gate

- scripts/sql/stagingRestoreSideEffectGate.sql reads job/queue counts, extension existence, public RLS and sensitive client grants without displaying data or changing the database.
- scripts/stagingRestoreSideEffectSafety.ts rejects an isolated clone with active cron jobs, queued HTTP requests, missing expected extensions, non-RLS public tables or sensitive client access.
- scripts/verifyRestoredStagingDatabase.ts now runs this safety check inside its existing READ ONLY transaction before comparing all 46 migration hashes and public schema fingerprints.
- tests/stagingRestoreSideEffectSafety.test.ts verifies both safe and unsafe states without any database connection.

## Protected restore procedure

1. Establish a network-egress-denied destination **before** initiating a real backup clone or restoring files. This SQL check cannot prevent cron/pg_net actions that occur before the test runs.
2. Obtain approval for a real encrypted staging backup. Supabase Restore to a New Project is an optional paid/beta process; it includes Auth users and may replicate executable extension jobs. Do not clone customer data to a public CI sandbox.
3. In the isolated copy, stop all cron jobs and other external workers, quarantine queued pg_net requests, and disable Telegram publishing, payment watchers, webhooks and email sends.
4. Connect privately through localhost to a clone called tgreposter_staging_restore_verification and run the existing command: npx tsx scripts/verifyRestoredStagingDatabase.ts, with the database URL passed privately using RESTORED_STAGING_POSTGRES_URL.
5. Even a PASS requires backup integrity, row-level recovery, external Storage objects, credentials/extension compatibility and rollback verification. Do not apply staging DDL or repair historical migration ledger without separate authorization.

Source guidance: https://supabase.com/docs/guides/platform/clone-project
Source guidance: https://supabase.com/docs/guides/auth/password-security

None of these tests authorizes enabling billing or changing production.