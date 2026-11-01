# Applied staging migration source parity audit

**Date:** October 27, 2026  
**Source branch:** `feat/commercial-staging-integration` (GitHub)  
**Read-only database:** Supabase staging `msmfilgdwuoymjhgtrmy`  
**Production and staging migration ledgers: NOT modified.**

## Verified comparison

All 46 entries in `supabase_migrations.schema_migrations` were compared by migration name and MD5 of the stored SQL statement to the corresponding local `supabase/migrations/*.sql` file. Only SQL hashes and metadata were transferred from staging, **not** SQL source text, credentials, or customer data.

| Classification | Number |
|---|---:|
| Source migration SQL files | 45 |
| Applied migration records | 46 |
| Applied migration names with a source-file match | 44 |
| Matched files with exact byte-identical SQL | 38 |
| Matching names but nonidentical SQL | 6 |
| Historical applied version/filename aliases | 23 |
| Staging-only repair records without a source SQL file | 2 |
| Source-only unapplied migration | 1 |

### Six SQL text mismatches

| Applied staging version/name | Source file | Whitespace-only difference? |
|---|---|---|
| `20260910134818_initial_schema` | `001_initial_schema.sql` | No |
| `20260929161219_persist_user_ui_locale` | `20260929161219_persist_user_ui_locale.sql` | No |
| `20261004160630_create_demo_requests` | `20261004160000_create_demo_requests.sql` | Yes |
| `20261004183118_index_crypto_payment_event_transactions` | `20261004183118_index_crypto_payment_event_transactions.sql` | Yes |
| `20261004184225_create_crypto_payment_network_state` | `20261004184225_create_crypto_payment_network_state.sql` | Yes |
| `20261012135929_allow_zero_value_crypto_unassigned_observations` | `20261012135929_allow_zero_value_crypto_unassigned_observations.sql` | No |

The `whitespace-only` classification was computed by MD5 comparison after removing whitespace from each text. **No** means text still differs after whitespace removal; it does **not** necessarily mean the SQL behavior differs. Comments or other formatting may account for some of those differences, and a separate careful semantic review is required. Do not automatically overwrite either SQL version.

**Two applied staging-only repairs:** `repair_missing_curator_settings_baseline`, `repair_missing_pg_cron_baseline`. Preserve both entries and their behavior when planning a real backup restore.

**Still unapplied in staging:** `20261021154000_ai_reconciliation_backoff.sql`. Its schema columns remain absent. Never mark it as applied or execute it against live staging before an actual approved backup/restore and ledger reconciliation.

## Regression guard

The offline `tests/stagingMigrationSourceParity.test.ts` checks the 46-entry baseline, expected source files, both repair entries, 23 version aliases, all six named SQL mismatches and 38 exact SQL hashes. It fails CI if historical repository migration files are silently replaced or an unexpected name/version mapping appears. The test uses no network or database credentials.

**Release blocker:** an actual protected staging PostgreSQL 17 backup must be restored to a network-isolated destination (with cron/pg_net and all Telegram/payment side effects disabled) and compared to a backup-time-matched baseline. Synthetic backups and a successful hash audit are not substitutes. Genuine two-account staging Auth acceptance remains separate.

This audit is read-only and does not authorize a `supabase db push`, migration ledger repair, customer checkout, or production deployment.

## Follow-up — reviewed executable SQL differences (October 27, 2026)

**Result:** All three non-whitespace differences were explained by read-only inspection of the exact applied migration statements. **No migration replay or ledger rewrite is needed to explain these particular differences.**

1. **`persist_user_ui_locale`**: The applied and repository SQL differ only in preceding line comments and formatting. After removing comments and whitespace in these reviewed files, the executable text has identical MD5 `2fa01506f6691ccd3699d1ca66a0f38d`. Staging currently has the `profiles.ui_locale` column.
2. **`allow_zero_value_crypto_unassigned_observations`**: The repository adds explanatory line comments; the applied DDL and column/constraint comment statement match. Normalized MD5 is `ab0ad37735c6d40b1a21b6b0f08d4289`. Staging's check constraint remains `amount >= 0`.
3. **`initial_schema`**: The repository source includes extra `pg_cron` extension/grants and `curator_settings` table/default-row setup that **were not part of the recorded initial applied SQL**. Those sections match two separately applied staging-only repair migrations:
   - `repair_missing_pg_cron_baseline`: executable SQL MD5 `2fd06845ccedbcbd1dc41801ded3a452`
   - `repair_missing_curator_settings_baseline`: executable SQL MD5 `5c1e3a273ecca1f15878c44da9da7f35`

After removing exactly those two sections from the repository's normalized `initial_schema` SQL, its MD5 equals the applied initial migration's normalized MD5: `dc33311976e3c0d0586757b50393b0cb`. Read-only staging checks also confirmed `pg_cron` exists, `curator_settings` exists, its `default` row exists, and the `postgres` role retains `cron` schema usage. **Do not rerun the extra DDL merely because it appears in the repository initial migration.**

The separate whitespace-only differences in `create_demo_requests`, `index_crypto_payment_event_transactions`, and `create_crypto_payment_network_state` were already identified; they remain recorded as such.

### Regression evidence and limitations

`tests/stagingHistoricalSqlDiscrepancies.test.ts` pins these five stored historical statement hashes and the reviewed normalized code equivalents without connecting to any database. It will fail if source SQL unexpectedly diverges. The normalizer is **deliberately limited to these reviewed statements**, not a general SQL parser or proof of runtime behavioral equivalence.

The remaining **real staging backup/restore gate stays BLOCKED**. This historical source-vs-ledger explanation does not prove backup completeness, recovery readiness, extension compatibility or tenant data integrity. The pending `20261021154000_ai_reconciliation_backoff.sql` remains unapplied. Production and active staging schemas were not changed.
