# Disposable PostgreSQL backoff migration rehearsal — October 25, 2026

Staging Supabase database runs PostgreSQL 17.6. Live read-only audit: 46 ledger entries; ai_usage_events has 15 columns, 5 indexes and 10 substantive constraints before backoff; RLS is enabled; neither backoff column exists.

Test: tests/sql/staging_backoff_postgres_rehearsal.sql. This is a guarded **schema reconstruction**, not a real staging backup or full database restore. It requires the exact disposable database name and explicit test-session marker before any writes (the workflow connects to the Docker service through runner localhost), loads the real commercial foundation and AI reconciliation source migrations, populates only synthetic two-owner records and one synthetic AI credit grant, rehearses transaction rollback and subsequent application exclusively on disposable PostgreSQL, and verifies schema objects, retained RLS, negative-attempt constraint, retry backoff and unchanged AI credit ledger.

The test passed on a sandbox-local PostgreSQL 18.6 server. PostgreSQL 18 exposes additional NOT NULL constraint catalog rows, unlike staging PostgreSQL 17. Assertions exclude type n from catalog constraint counts. The new dedicated GitHub Actions workflow runs against Docker PostgreSQL 17 to match the staging major version, and checks that a wrong database name fails closed.

**Limitations:** This test only reconstructs two real source migrations. It does not restore every live Supabase schema, extension, migration, trigger, or customer record. Historical 23 version aliases and two repair migrations are previously audited, not replayed or repaired. See docs/STAGING_MIGRATION_LEDGER_RECONCILIATION.md and docs/staging-migration-ledger-snapshot.json.

Before any staging migration, obtain and verify a staging-only pg_dump backup, restore it into a separate matching-PostgreSQL isolated database, audit all ledger aliases and run the migration with rollback checks. Real two-user staging Auth sign-in remains unverified without authorized test credentials.

No writes, schema changes, migration-history changes, billing enablement or production changes were made against staging or production.