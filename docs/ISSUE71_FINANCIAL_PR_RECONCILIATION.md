# Historical financial acceptance PR reconciliation — October 25, 2026

Scope: [PR #44](https://github.com/hydedfeg/TGReposter/pull/44) and [PR #45](https://github.com/hydedfeg/TGReposter/pull/45). Integration target: `feat/commercial-staging-integration`; source at audit: `adb35d8362e55d6c111d935960eedae82b118113`.

## Phase 10 (#44)

| Original PR asset | Current disposition |
| --- | --- |
| `tests/billingFinancialAcceptance.test.ts` | Ported by [#72](https://github.com/hydedfeg/TGReposter/pull/72), subsequently improved for current owner isolation and catalog rules |
| `tests/billingPaymentEvidenceAcceptance.test.ts` | Ported by #72, strengthened to respect configured 120-confirmation BSC finality |
| `tests/sql/phase10_staging_billing_acceptance.sql` | Archived under `docs/archive/phase10/phase10_staging_billing_acceptance.sql` for historical evidence only |
| `docs/PHASE_10_BILLING_FINANCIAL_ACCEPTANCE.md` | Archived under `docs/archive/phase10/PHASE_10_BILLING_FINANCIAL_ACCEPTANCE.md`; original text preserved below historical banner |
| `.github/workflows/ci.yml` | Current CI and dedicated `phase11-financial-postgres.yml` supersede the original workflow changes |

**Important:** The old Phase 10 SQL uses `confirmations > 0` in a synthetic evidence check, **not** the current network-specific finality requirement. It is historical, intentionally outside `tests/sql`, and must not be run to certify live payment fulfillment. The maintained tests use the actual fulfillment service and current confirmation policy.

## Phase 11 (#45)

| Original PR asset | Current disposition |
| --- | --- |
| `tests/billingConcurrentPg.pg-check.ts` | Ported by [#73](https://github.com/hydedfeg/TGReposter/pull/73), strengthened on staging |
| `scripts/verifyStagingBillingAuth.ts` | Ported by #73 and kept available on staging; **real authenticated two-account execution is still outstanding** |
| `.github/workflows/ci.yml` | A dedicated PostgreSQL 16 concurrency workflow `.github/workflows/phase11-financial-postgres.yml` was added by #73 |
| `docs/PHASE_11_LIVE_STAGING_ACCEPTANCE.md` | Preserved verbatim on production `main` via the prior documentation publishing lineage ([source on main](https://github.com/hydedfeg/TGReposter/blob/main/docs/PHASE_11_LIVE_STAGING_ACCEPTANCE.md)) |
| `docs/PRICING_AND_SALES_PLAN.md` | Preserved on [main](https://github.com/hydedfeg/TGReposter/blob/main/docs/PRICING_AND_SALES_PLAN.md) |
| `docs/SALES_PLAN_IMPLEMENTATION_RECORD.md` | Preserved on [main](https://github.com/hydedfeg/TGReposter/blob/main/docs/SALES_PLAN_IMPLEMENTATION_RECORD.md) |
| `docs/SALES_PLAN_IMPLEMENTATION_CHANGELOG.md` | Preserved on [main](https://github.com/hydedfeg/TGReposter/blob/main/docs/SALES_PLAN_IMPLEMENTATION_CHANGELOG.md) |
| `README.md` | Historic documentation pointers already belong on `main`; current staging README retains the newer multilingual development policy |

## Scope and remaining blockers

These historical drafts are **superseded but not GitHub-merged**. Closing them does not alter branches, erase commits, change the staging database, activate checkout, publish plans, or merge anything to `main`. Do not merge the outdated stacked PR heads on top of the newer integration branch.

The exact CI-passed staging branch is the release source of truth: [PR #43](https://github.com/hydedfeg/TGReposter/pull/43). [PR #32](https://github.com/hydedfeg/TGReposter/pull/32) remains the core payments draft. Current work includes synthetic two-customer HTTP acceptance, real disposable PostgreSQL concurrency tests, and migration provenance guards.

**Still unverified:** real two-account staging Supabase Auth acceptance, optional expressly approved on-chain transaction and full settlement, staged commercial activation, and a reviewed Supabase migration-history alignment. Production must remain untouched.
