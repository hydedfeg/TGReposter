# TGReposter — Staging Supabase migration ledger reconciliation

**Audit date:** October 21, 2026  
**Tracking:** [Issue #71](https://github.com/hydedfeg/TGReposter/issues/71)  
**Code baseline:** `ee935cd3d3271ef25ddd6225d97a8d0cc2b34c06` on `feat/commercial-staging-integration`  
**Database:** staging-only `msmfilgdwuoymjhgtrmy` (read-only inspected). Production `biowrbnafkagaafonzws` has separate history and MUST NOT be changed without a separate authorization.

## Status and scope

Read-only GitHub migration-tree inventory versus Supabase `list_migrations`:

| Measurement | Result |
| --- | ---: |
| Migration SQL files in source | 45 |
| Applied migration records in staging | 46 |
| Files with matching migration **names**, but differing **versions** | 23 |
| Migration records without a corresponding named source file | 2 |
| Truly unapplied source migration(s) | 1 |

**Important:** Matching names or object existence does not automatically prove every historical SQL script is identical to the applied SQL. Never run the source filenames as fresh migrations or repair the remote ledger from this mapping alone. No database migration or version repair has been executed.

## Applied in staging under different versions

| GitHub source file | Applied staging ledger record | Assessment |
| --- | --- | --- |
| `001_initial_schema.sql` | `20260910134818_initial_schema` | Name match; version mismatch—no replay |
| `002_auth_rls.sql` | `20260910134821_auth_rls` | Name match; version mismatch—no replay |
| `20260823161247_video_media.sql` | `20260910134823_video_media` | Name match; version mismatch—no replay |
| `20260823165516_temporary_enable_pg_net_for_telegram_smoke_test.sql` | `20260910134824_temporary_enable_pg_net_for_telegram_smoke_test` | Name match; version mismatch—no replay |
| `20260823165548_temporary_disable_pg_net_after_telegram_smoke_test.sql` | `20260910134826_temporary_disable_pg_net_after_telegram_smoke_test` | Name match; version mismatch—no replay |
| `20260825134100_add_promotion_campaign_schema.sql` | `20260910134828_add_promotion_campaign_schema` | Name match; version mismatch—no replay |
| `20260831153243_normalize_runtime_configuration.sql` | `20260910135021_normalize_runtime_configuration` | Name match; version mismatch—no replay |
| `20260831153439_complete_post_runtime_fields.sql` | `20260910135025_complete_post_runtime_fields` | Name match; version mismatch—no replay |
| `20260831154334_secure_runtime_and_schedule_inbox.sql` | `20260910135148_secure_runtime_and_schedule_inbox` | Name match; version mismatch—no replay |
| `20260901131205_harden_auth_profile_security.sql` | `20260910135149_harden_auth_profile_security` | Name match; version mismatch—no replay |
| `20260901132706_move_main_bot_token_to_vault.sql` | `20260910135151_move_main_bot_token_to_vault` | Name match; version mismatch—no replay |
| `20260902150421_secure_auth_profile_bootstrap.sql` | `20260910135156_secure_auth_profile_bootstrap` | Name match; version mismatch—no replay |
| `20260902153812_scope_destinations_by_user.sql` | `20260910135158_scope_destinations_by_user` | Name match; version mismatch—no replay |
| `20260902185412_scope_content_inbox_by_user.sql` | `20260910135159_scope_content_inbox_by_user` | Name match; version mismatch—no replay |
| `20260903124814_scope_all_application_data_by_user.sql` | `20260910135201_scope_all_application_data_by_user` | Name match; version mismatch—no replay |
| `20260905125947_restrict_profile_mutations.sql` | `20260910135214_restrict_profile_mutations` | Name match; version mismatch—no replay |
| `20260905133955_finalize_personal_reposting_runtime.sql` | `20260910135216_finalize_personal_reposting_runtime` | Name match; version mismatch—no replay |
| `20260905152000_finalize_personal_promotion_runtime.sql` | `20260910135218_finalize_personal_promotion_runtime` | Name match; version mismatch—no replay |
| `20260910133829_reject_implicit_promotion_owner_reassignment.sql` | `20260910135219_reject_implicit_promotion_owner_reassignment` | Name match; version mismatch—no replay |
| `20261004160000_create_demo_requests.sql` | `20261004160630_create_demo_requests` | Name match; version mismatch—no replay |
| `20261017143000_allow_billing_expiration_retries.sql` | `20261017143828_allow_billing_expiration_retries` | Name match; version mismatch—no replay |
| `20261019154000_checkout_rate_limits.sql` | `20261019133218_checkout_rate_limits` | Name match; version mismatch—no replay |
| `20261019175500_atomic_plan_capacity_guards.sql` | `20261019174232_atomic_plan_capacity_guards` | Name match; version mismatch—no replay |

## Staging-only records without repository files

- `20260910135008_repair_missing_curator_settings_baseline` — staging-only repair, no matching repository file; preserve and inspect separately.
- `20260910135132_repair_missing_pg_cron_baseline` — staging-only repair, no matching repository file; preserve and inspect separately.

These are historical repair migrations. Their original SQL and effect must be independently recovered from audited migration history or a reliable backup before any source reconstitution. **Do not invent new replacement SQL** from the names.

## Genuinely unapplied source migration

- `supabase/migrations/20261021154000_ai_reconciliation_backoff.sql`: not present by version or matching name in staging ledger.


The new `ai_reconciliation_backoff` migration adds internal retry metadata; the `ai_usage_events.reconciliation_attempts` column was absent in staging at audit time. Do not start `TGREPOSTER_AI_RECONCILIATION_ENABLED` before this migration is reviewed and successfully applied, with the exact deployed code version verified.

## Additional billing SQL equivalence evidence

The staging `enforce_billing_owner_resource_capacity()` **PL/pgSQL function body was compared character-for-character** with the body of `20261019175500_atomic_plan_capacity_guards.sql`; result: exact match (4150 characters). All four trigger names and their `AFTER INSERT OR UPDATE OF ...` definitions match the source. The `billing_entitlement_enforcement` table exists with RLS enabled and its stored `enabled` flag is **false**. Neither `anon` nor `authenticated` has execute permission on that function.

The `billing_checkout_rate_limits` table exists with its expected seven columns and five named constraints. PostgreSQL check expressions match the source's owner, action, minute-hit and hour-hit checks; RLS is on; `anon` and `authenticated` cannot select from the table, while `service_role` can. **These checks establish strong schema correspondence, not blanket equivalence of all migration statements, privileges, defaults, descriptions or other historical scripts.**

The staging ledger records these under `20261019174232_atomic_plan_capacity_guards` and `20261019133218_checkout_rate_limits`, rather than the source versions `20261019175500` and `20261019154000`.

## Historical payment PR resolution

- **PR #32:** Core redacted error helpers, Telegram notification diagnostics, four translations and routes are already byte-identical in the integration branch. Current payment runtime adds TON provider 429 backoff, skip metadata and watcher injection. Current scheduler additionally redacts database journal failures and filters intentionally skipped networks from failure warnings. Preserve the newer runtime; **do not remerge old diagnostic commits**.
- **PR #60:** Capacity SQL function, four triggers, backend SQLSTATE `PZ409` handling and channel/promotion API error translation are incorporated. Channel and promotion route files are byte-identical to #60; the present billing guard has additional gated custom-plan support. Atomic-capacity PostgreSQL concurrency workflows are already passing. **Do not replay the older migration or overwrite the current guard.**
- Historical PR branches may be closed as superseded only after a documented reviewer decision; do not delete historical branches or rewrite commit ancestry.

## Safe staging synchronization sequence (not yet authorized or performed)

1. Freeze the intended integration commit and collect staging-only database backup, Supabase migration history snapshot, current Railway environment configuration and a rollback point. Verify environment IDs and do **not** point commands to production.
2. Review all 23 renamed migration pairs, especially historical role/RLS/ownership changes, using original migration contents or verified database definitions. Recover the two repair-only migration scripts from a trustworthy source; investigate any mismatch rather than auto-fixing it.
3. Agree on **one** audited history-alignment method compatible with the project's Supabase CLI version. If repository-version renaming or a migration-ledger repair is considered, test it against a *disposable staging clone* first and document all before/after versions. Do not run both methods, and do not mark unapplied scripts as applied.
4. On a reviewed staging target only, separately plan and apply the new AI reconciliation backoff migration after verifying its constraint/index compatibility and taking a rollback snapshot. Leave the AI reconciliation scheduler off.
5. Deploy the **exact CI-passed** staging-integration commit on Railway once deployment capacity is restored. Confirm running commit and /health before any opt-in testing.
6. Run synthetic, owner-isolated financial HTTP, PGlite and disposable PostgreSQL tests; verify receipt/fulfillment once-only behavior, quota triggers and reconciliation unknown-cost holds. Keep live crypto transfers optional (not required).
7. Require explicit approval before *any* merge into `main`, production schema changes, live checkout, automatic notifications, subscription enforcement, commercial AI activation or billing scheduler activation.

### Operational blocker

Railway staging last verified healthy 1/1 replicas but serving `0140bfa`, behind the integration branch. Deployment attempts returned “Deploys have been paused temporarily.” A running older service is not evidence that the new code or schema works together.

### Read-only verification script

Use [`docs/sql/issue71_staging_billing_preflight.sql`](./sql/issue71_staging_billing_preflight.sql) against **staging only**. It performs `SELECT` queries; it does not modify migrations, business records, flags or schema. All audit findings must be refreshed immediately before migration repair or deployment.


## October 24, 2026 — original migration SQL recovered and compared

The staging Supabase `supabase_migrations.schema_migrations.statements`
column retains the **original migration SQL** (one stored statement for each
of the 23 version-mismatched source files). A read-only, direct text comparison
against the current source tree found:

| Classification | Migrations | Resolution |
| --- | ---: | --- |
| Exact SQL bytes/text | **21 of 23** | Source migration text matches stored staging text. Versions differ; do not replay. |
| Trailing newline only | **1 of 23** | `create_demo_requests` differs by one final newline; trimmed text is identical. |
| Material text divergence | **1 of 23** | `initial_schema`: GitHub 2,565 characters, stored staging 1,894 characters. **Not equivalent; requires human review.** |

The two missing staging repair migrations were recovered verbatim from their
historical ledger records and archived at:

- `docs/sql/staging-ledger-archive/20260910135008_repair_missing_curator_settings_baseline.sql`
- `docs/sql/staging-ledger-archive/20260910135132_repair_missing_pg_cron_baseline.sql`

Both archives are intentionally **outside** `supabase/migrations/`.
The existing `public.curator_settings` table and `pg_cron` extension in
`pg_catalog` were verified present in staging.

The immutable-source inventory and stored-SQL checksums are recorded in
`docs/staging-migration-ledger-snapshot.json`. A CI test,
`tests/stagingMigrationLedgerGuard.test.ts`, rejects unreviewed edits,
renames, additions, and removals to the audited 45 migration source files.
It also verifies the 21 exact matches, known newline-only discrepancy,
unresolved initial-schema difference, and the two recovered SQL archives.

**The manifest does not authorize applying scripts or repairing the Supabase
ledger.** The original initial-schema discrepancy remains a blocker to
mechanically marking every historical source version as applied. Use an
isolated disposable database clone and an audited plan before any ledger
repair. The genuinely new `ai_reconciliation_backoff` migration also
remains unapplied and its scheduler must stay off.

The new Railway staging deployment of `56597ff` was verified SUCCESS and
online 1/1 on October 24. This establishes deployment of the application
code, **not** reconciliation of the staging migration ledger.
