# Verified staging restore provenance — read-only acceptance tool

**Snapshot date:** 2026-10-27. **Actual private restore: NOT performed.** This is metadata-only evidence, not a backup, and is not authorization to apply migrations.

`docs/staging-restore-provenance-baseline.json` includes PostgreSQL major version, 46 exact migration versions/names/statement MD5s, public-schema relations/indexes/constraints/policies/functions/triggers **definition fingerprints**, and aggregate commercial billing counts, taken read-only from staging Supabase project `msmfilgdwuoymjhgtrmy`. No customer record, sensitive configuration or statement SQL is exported.

`scripts/sql/stagingRestoreFingerprint.sql` produces the same read-only fingerprint on an isolated restore; `scripts/verifyRestoredStagingDatabase.ts` compares it to this baseline and fails closed on schema drift, missing or changed history, a pending backoff migration already applied, or commercial gates changing. `tests/stagingRestoreVerifier.test.ts` exercises that comparison offline.

## Trusted operator instructions

Obtain an approved encrypted **actual staging backup** and restore it inside a restricted, trusted PostgreSQL 17/Supabase-compatible environment. Disable outgoing webhooks, Telegram publishing, payment scanners, cron, and all other side effects on the restored clone. Never put real backups, data or credentials into public GitHub CI, sandbox runners or chat.

Ensure the reference baseline was captured **at the backup's exact point in time**. This snapshot will not automatically match backups from earlier or later dates. Recalculate and review a time-matched baseline before comparison when necessary.

Use a secured localhost tunnel to a private DB named `tgreposter_staging_restore_verification`. Provide its connection URL in the operator's private environment as `RESTORED_STAGING_POSTGRES_URL` and execute `npx tsx scripts/verifyRestoredStagingDatabase.ts`. The script refuses any non-loopback target and performs only queries in a READ ONLY transaction. It will not connect to production or live staging.

Even a PASS does **not** prove row-for-row backup consistency, external object storage, full Supabase extensions/roles, freshness or actual recoverability; these require separate protected restore audits, backup integrity checks, and approved rollback procedures. Never blindly replay the 23 historical migration aliases or two staging-only repairs, never manually rewrite migration history, and don't apply `20261021154000_ai_reconciliation_backoff.sql` on staging before separate approval.

The genuine two-account staging Supabase Auth acceptance still requires staging-only private test credentials. No customer orders, paid subscriptions, crypto transfers, production deployments or payment launch settings are changed by this tooling.
