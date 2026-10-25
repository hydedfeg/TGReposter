# Staging commercial release — backup and restore gate

**Date:** October 25, 2026. **Gate: not complete.** A real staging database backup/restore has not yet been performed.

## Read-only staging baseline

- Supabase project `msmfilgdwuoymjhgtrmy`, PostgreSQL 17.6.
- 46 applied migration entries (all names and versions unique). Ledger fingerprint for ordered version/name/stored-statement digest: `1cf602e36ee93da626db94b43646ed04` (October 25). This is not an archive checksum.
- Historical migration mismatches: 23 aliases and two archived repairs, previously audited in `docs/STAGING_MIGRATION_LEDGER_RECONCILIATION.md`.
- `20261021154000_ai_reconciliation_backoff.sql` remains unapplied to staging. Billing checkout, quotas, commercial AI reconciliation and public plan publication remain disabled.

## Automated evidence

The PostgreSQL 17 migration rehearsal in `.github/workflows/staging-backoff-postgres.yml` verifies transactional migration rollback, schema, owner isolation, credit ledger and RLS on a disposable schema reconstruction.

The second workflow, `.github/workflows/staging-synthetic-backup-restore.yml`, performs an actual `pg_dump` **of synthetic data only** on a disposable PostgreSQL 17 service, restores the custom-format archive into another disposable PostgreSQL 17 database, and validates it using `tests/sql/staging_synthetic_restore_verify.sql`. Explicit safety guards reject wrong database names and session markers. No staging credentials, customer data or blockchain activity are involved, and the test archive is not uploaded.

This confirms the dump/restore mechanics for the relevant reconstructed billing tables. It is **not** a clone, backup or restoration of the live Supabase staging database.

## Actual staging restore approval gate

1. Use an authorized private staging-only operations environment. Obtain a real staging backup via [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups) or the supported [CLI backup/restore procedure](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore). The current connector does not offer a backup-download operation.
2. Protect staging credentials and the backup under encrypted storage; do not place credentials or the backup in GitHub Actions, a public Vercel preview, the repository, logs or chat. Use a separate isolated trusted PostgreSQL 17/Supabase-compatible restore target, never production.
3. On the restore, block all network egress and disable Telegram delivery, payment scanning, background cron jobs, outgoing webhooks and other side effects. No customer app or worker may connect to the restore.
4. Verify archive integrity, restore ability, all historical migration versions and stored SQL checksums (46 ledger records), table/column/index/constraint/function/trigger/RLS definitions, and ownership/row-count consistency. Compare the restored ledger fingerprint to the read-only staging baseline.
5. On the restored clone only, rehearse the single unapplied backoff migration, preserving customer AI credit ledgers. Practice rollback and re-restore. Do not replay the 23 mismatched versions or two repair entries or blindly run `supabase db push`.
6. Require a reviewed recovery path, release signoff and explicit authorization before touching live staging schema. Production must remain untouched.

## Real Auth acceptance

`scripts/verifyStagingBillingAuth.ts` already validates two genuine, independent Supabase staging sign-ins without creating orders or modifying billing data. It needs two existing confirmed test account credentials supplied privately to a trusted execution environment. Anonymously denied or forged bearer requests are a separate weaker test, not a replacement. Never reset customer passwords or paste JWTs into chat.

**Open blockers:** verified real staging backup/restore, migration ledger alignment release decision and actual two-account Auth acceptance. All commercial/payment launch switches remain disabled.