# Verified staging restore provenance — read-only acceptance tool

**Snapshot date:** 2026-10-29. **Actual private restore: NOT performed.** This is metadata-only evidence, not a backup, and is not authorization to apply migrations.

`docs/staging-restore-provenance-baseline.json` includes PostgreSQL major version, 46 exact migration versions/names/statement MD5s, public-schema relations/indexes/constraints/policies/functions/triggers **definition fingerprints**, aggregate commercial billing counts, Auth/profile counts and **12 per-table tenant ownership and content fingerprints** (row totals, ordered owner MD5s and canonical JSONB whole-row MD5 aggregate digests), taken read-only from staging Supabase project `msmfilgdwuoymjhgtrmy`. No customer record, email, raw owner principal, token, sensitive configuration or migration SQL is exported. No plaintext row data, customer text, wallet addresses, API keys, bot tokens, or owner IDs are exported. Fingerprints are **MD5 drift signals**, not cryptographic backup checksums, independent proof of complete data recovery, or protection against adversarial tampering.

`scripts/sql/stagingRestoreFingerprint.sql` produces the same read-only fingerprint on an isolated restore; `scripts/verifyRestoredStagingDatabase.ts` compares it to this baseline and fails closed on schema drift, missing or changed history, changing Auth/profile or tenant footprints, a pending backoff migration already applied, or commercial gates changing. It rejects connection URL query parameters to prevent overriding localhost with PostgreSQL host/service options. `tests/stagingRestoreVerifier.test.ts` exercises that comparison offline.

## Trusted operator instructions

Obtain an approved encrypted **actual staging backup** and restore it inside a restricted, trusted PostgreSQL 17/Supabase-compatible environment. Disable outgoing webhooks, Telegram publishing, payment scanners, cron, and all other side effects on the restored clone. Never put real backups, data or credentials into public GitHub CI, sandbox runners or chat.

Ensure the reference baseline was captured **at the backup's exact point in time**. This snapshot will not automatically match backups from earlier or later dates. Recalculate and review a time-matched baseline before comparison when necessary.

Use a secured localhost tunnel to a private DB named `tgreposter_staging_restore_verification`. **Before any verification,** isolate the restored environment at the network/firewall level and disable cron, pg_net queues, Telegram, payment workers, email and webhook side effects. A localhost tunnel alone is insufficient: it could point to a live database.

After verifying these external restrictions, in a **separate privileged session connected to the isolated restored database only**, the authorized operator must explicitly attest the isolated clone:

```sql
-- STOP: only on the privately restored, egress-blocked PostgreSQL 17 clone.
SELECT current_database(); -- expect tgreposter_staging_restore_verification
COMMENT ON DATABASE tgreposter_staging_restore_verification
  IS 'TGREPOSTER_PRIVATE_RESTORE_OPERATOR_ATTESTED_v1';
```

This database-level comment is an **operator attestation**, not a technical guarantee of network isolation, backup completeness, or a substitute for independent firewall verification. It must be written only **after** the backup has been restored and side effects disabled, never in live staging, production, a generic template database or the source archive. The comment does not affect the public-schema fingerprint.

Provide the connection URL privately via `RESTORED_STAGING_POSTGRES_URL` and run `npx tsx scripts/verifyRestoredStagingDatabase.ts`. The verifier validates loopback and exact database name, checks this database comment **before** inspecting restored state, rejects active side effects, then compares the baseline. All verifier SQL runs in a READ ONLY transaction; it never creates or sets the attestation itself. It is not a live staging/production acceptance test.

Even a PASS does **not** prove row-for-row backup consistency, external object storage, full Supabase extensions/roles, freshness or actual recoverability; these require separate protected restore audits, backup integrity checks, and approved rollback procedures. Never blindly replay the 23 historical migration aliases or two staging-only repairs, never manually rewrite migration history, and don't apply `20261021154000_ai_reconciliation_backoff.sql` on staging before separate approval.

The genuine two-account staging Supabase Auth acceptance still requires staging-only private test credentials. No customer orders, paid subscriptions, crypto transfers, production deployments or payment launch settings are changed by this tooling.

## Ownership snapshot limitations (October 27)

As of October 29, the `rowFingerprintAlgorithm` is `pg17-jsonb-row-md5-sorted-aggregate-v1`: for each table, the SQL hashes every full row's `to_jsonb(row)::text`, sorts those inner MD5 digests, concatenates and MD5-hashes that sequence. A changed value can now fail provenance **even if row counts and owner principals are unchanged**. SQL verification is read-only, and only the aggregate 32-character fingerprints are stored. Source staging used UTC/ISO/MDY/Postgres session formatting; the private verifier explicitly pins TimeZone, DateStyle and IntervalStyle to avoid false mismatches. This is deliberately limited to the twelve selected tenant tables and does not fingerprint `auth.users`, Supabase Storage objects, off-database secrets, or every database table.

The twelve selected tables are: `source_channels`, `destination_targets`, `user_inbox_items`, `promotion_campaigns`, `promotion_targets`, `telegram_bot_accounts`, `posts`, `filters`, `ai_usage_events`, `crypto_payment_invoices`, `billing_subscription_orders`, `billing_ai_topup_orders`. Each snapshot contains a row count and an MD5 of the ordered owner-principal distribution. This now detects changed row totals, redistributed *ownership* and changes to canonical whole-row values for these tables, but does **not** prove backup-file integrity, external Storage recovery, point-in-time consistency, full database row integrity, or the absence of deliberately engineered MD5 collisions. The baseline must match the authorized backup's exact capture point. The Auth section compares total, email-confirmed, profile and orphaned-profile counts.

The reference was refreshed through a **read-only staging query** after confirming no drift in the original migration, schema or commercial reference values. For an actual backup, capture and review a separate baseline **at the backup's exact point in time**; an earlier or later live snapshot may legitimately differ.
