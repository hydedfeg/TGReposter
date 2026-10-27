# Verified staging restore provenance — read-only acceptance tool

**Snapshot date:** 2026-10-27. **Actual private restore: NOT performed.** This is metadata-only evidence, not a backup, and is not authorization to apply migrations.

`docs/staging-restore-provenance-baseline.json` includes PostgreSQL major version, 46 exact migration versions/names/statement MD5s, public-schema relations/indexes/constraints/policies/functions/triggers **definition fingerprints**, aggregate commercial billing counts, Auth/profile counts and **12 per-table tenant ownership fingerprints** (row totals plus MD5 of ordered owner principals), taken read-only from staging Supabase project `msmfilgdwuoymjhgtrmy`. No customer record, email, raw owner principal, token, sensitive configuration or migration SQL is exported. The owner MD5 values are metadata fingerprints, **not a backup checksum or proof of row-content integrity**.

`scripts/sql/stagingRestoreFingerprint.sql` produces the same read-only fingerprint on an isolated restore; `scripts/verifyRestoredStagingDatabase.ts` compares it to this baseline and fails closed on schema drift, missing or changed history, changing Auth/profile or tenant footprints, a pending backoff migration already applied, or commercial gates changing. It rejects connection URL query parameters to prevent overriding localhost with PostgreSQL host/service options. `tests/stagingRestoreVerifier.test.ts` exercises that comparison offline.

## Trusted operator instructions

Obtain an approved encrypted **actual staging backup** and restore it inside a restricted, trusted PostgreSQL 17/Supabase-compatible environment. Disable outgoing webhooks, Telegram publishing, payment scanners, cron, and all other side effects on the restored clone. Never put real backups, data or credentials into public GitHub CI, sandbox runners or chat.

Ensure the reference baseline was captured **at the backup's exact point in time**. This snapshot will not automatically match backups from earlier or later dates. Recalculate and review a time-matched baseline before comparison when necessary.

Use a secured localhost tunnel to a private DB named `tgreposter_staging_restore_verification`. Provide its connection URL in the operator's private environment as `RESTORED_STAGING_POSTGRES_URL` and execute `npx tsx scripts/verifyRestoredStagingDatabase.ts`. The script refuses any non-loopback target and performs only queries in a READ ONLY transaction. It will not connect to production or live staging.

Even a PASS does **not** prove row-for-row backup consistency, external object storage, full Supabase extensions/roles, freshness or actual recoverability; these require separate protected restore audits, backup integrity checks, and approved rollback procedures. Never blindly replay the 23 historical migration aliases or two staging-only repairs, never manually rewrite migration history, and don't apply `20261021154000_ai_reconciliation_backoff.sql` on staging before separate approval.

The genuine two-account staging Supabase Auth acceptance still requires staging-only private test credentials. No customer orders, paid subscriptions, crypto transfers, production deployments or payment launch settings are changed by this tooling.

## Ownership snapshot limitations (October 27)

The twelve selected tables are: `source_channels`, `destination_targets`, `user_inbox_items`, `promotion_campaigns`, `promotion_targets`, `telegram_bot_accounts`, `posts`, `filters`, `ai_usage_events`, `crypto_payment_invoices`, `billing_subscription_orders`, `billing_ai_topup_orders`. Each snapshot contains a row count and an MD5 of the ordered owner-principal distribution. This detects changed row counts or redistributed *ownership*, but does **not** detect changed post contents, verify full row integrity, prove foreign-key recovery or replace a complete real backup test. The Auth section compares total, email-confirmed, profile and orphaned-profile counts.

The reference was refreshed through a **read-only staging query** after confirming no drift in the original migration, schema or commercial reference values. For an actual backup, capture and review a separate baseline **at the backup's exact point in time**; an earlier or later live snapshot may legitimately differ.
