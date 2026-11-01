# Staging AI backoff migration — disposable rehearsal

**Audit date:** October 25, 2026  
**Staging database inspected read-only:** `msmfilgdwuoymjhgtrmy`  
**Target branch:** `feat/commercial-staging-integration`  
**Migration under review:** `20261021154000_ai_reconciliation_backoff.sql`

## Verified

The staging migration ledger contains 46 applied records. The source repository has 45 migration files, including exactly one unapplied source migration: `20261021154000_ai_reconciliation_backoff.sql`. Historical source-versus-ledger drift consists of 23 differently numbered migrations and two archived, staging-only repairs. These are historical identities, **not scripts to replay**. See `docs/STAGING_MIGRATION_LEDGER_RECONCILIATION.md` and `docs/staging-migration-ledger-snapshot.json`.

The test `tests/stagingBackoffMigrationRehearsal.test.ts` loads the source migration stack into a disposable PostgreSQL-compatible PGlite engine with the existing tenant fixture. It reconstructs the 46 historical identities from the audited snapshot without writing a migration ledger. It applies the new backoff SQL in a transaction, rolls back, checks data/schema preservation, and then applies it in the disposable engine for compatibility assertions.

The rehearsal verifies the two retry metadata columns, default attempts value of zero, nonnegative attempts constraint, filtered due-work index, retained RLS and denied direct client access. Existing AI events and the AI credit ledger remain intact. It executes the actual internal OpenRouter reconciliation worker query against synthetic due rows and verifies one claim, no duplicate immediate retry, exponential backoff scheduling, and sanitized pending state after an unknown provider cost. Provider and settlement functions are mocks: **no AI request, credit debit, or payment occurs**.

## Remaining limits and safe deployment sequence

1. PGlite validates this SQL path but is not a restored managed Supabase/PostgreSQL database. Before any real migration or ledger synchronization, take a verified staging-only backup and rehearse the selected procedure against a **separately provisioned disposable PostgreSQL restore** with the required extensions and privileges.
2. Preserve the 23 historical aliases and two separate repairs. Review the exact stored migration SQL, the existing schema, and the intended single migration-history reconciliation method. Never blindly run `supabase db push`, rename old ledger entries, or mark unapplied SQL as applied.
3. On the restored disposable PostgreSQL database, check before/after objects, privileges, data integrity, rollback behavior, and the new backoff migration. Record any real-PostgreSQL differences before planning a staging DDL operation.
4. Apply staging schema changes only after a separately reviewed rollback and release decision. Keep `TGREPOSTER_AI_RECONCILIATION_ENABLED=false`, billing/checkout disabled, plans unpublished, and entitlement enforcement disabled. Production is explicitly outside this work.

**No live staging DDL, remote migration history repair, blockchain transfer, new order, subscription, AI credit adjustment, production change, or billing activation was performed during this rehearsal.**
