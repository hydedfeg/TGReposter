# Historical staging-only SQL archive — NOT migrations to execute

The three SQL files in this directory are **verbatim originals** recovered
read-only from the Supabase staging migration ledger on October 24, 2026
(project `msmfilgdwuoymjhgtrmy`). They were already applied to staging
under their recorded versions in September 2026.

**Do not copy them into `supabase/migrations`, execute them, run `db push`,
or mark new migration versions applied based on this archive.**

| Ledger version | Name | Provenance |
| --- | --- | --- |
| `20260910134818` | `initial_schema` | Ledger `statements[1]` (original baseline) |
| `20260910135008` | `repair_missing_curator_settings_baseline` | Ledger `statements[1]` |
| `20260910135132` | `repair_missing_pg_cron_baseline` | Ledger `statements[1]` |

The current source `001_initial_schema.sql` combines the original baseline
with the two archived repair migrations. Its base table section matches the
stored original; its added statements match both repair scripts after
SQL-whitespace normalization. **Do not replay the three files as new migrations.**

A CI test verifies their MD5 text digests against a committed ledger snapshot.
These digests are integrity checks for the archived snapshot, **not**
cryptographic proof of who authorized their original execution.

Read [the staging ledger reconciliation runbook](../../STAGING_MIGRATION_LEDGER_RECONCILIATION.md)
and [Issue #71](https://github.com/hydedfeg/TGReposter/issues/71)
before planning any schema or migration-history operation. Production remains
out of scope.
