# Issue #71 — PR #60 and #61 financial capability reconciliation

**Review date:** October 25, 2026  
**Target branch:** `feat/commercial-staging-integration`  
**Reviewed staging base:** `2dbbb36e7ffccaebd2ac962b4ea5c73a9fc7e818`  
**Historical PRs:** [#60 — atomic plan quotas](https://github.com/hydedfeg/TGReposter/pull/60), [#61 — custom plan eligibility](https://github.com/hydedfeg/TGReposter/pull/61).  
**Review result:** Current integration preserves the substantive functionality; historical heads are divergent and **must not be merged wholesale**.

## PR #60: atomic owner-scoped plan quotas

Exact Git blob matches between the old PR head and the current integration branch:

- `supabase/migrations/20261019175500_atomic_plan_capacity_guards.sql`
- `tests/atomicPlanCapacityDb.test.ts`
- `tests/atomicPlanCapacityPostgres.test.ts`
- `.github/workflows/entitlement-postgres-concurrency.yml`
- `server/routes/channels.ts` and `server/routes/promotion.ts`
- `docs/ATOMIC_BACKEND_ENTITLEMENT_GATES.md`

The integration's `server/billing/backendEntitlementGuard.ts` differs to call `resolveEffectiveCatalogPlan` for the later custom-tier compatibility work. Old `server.ts` lines remain present, with additional separately gated commercial AI and reconciliation code added since that PR. The old PR's SQLSTATE `PZ409` handling is retained.

**Ledger warning:** This source SQL was applied on staging under recorded version `20261019174232_atomic_plan_capacity_guards`, not its source filename version `20261019175500`. The audited staging ledger archives and checksum comparisons establish its provenance. **Do not replay this migration or repair the ledger by guessing.**

Staging read-only verification on October 25: `billing_entitlement_enforcement.enabled=false`. Its user-visible backend preflight and database policy both remain separate launch gates.

## PR #61: custom Sales Plan compatibility

Exact blob matches:

- `server/billing/customPlanEligibility.ts`
- `server/billing/checkoutQuoteService.ts`
- `tests/customPlanCompatibility.test.ts`

Current `billingOverviewService.ts` differs only in formatting around the custom effective-plan resolver. Current `backendEntitlementGuard.ts` combines the same resolver with quota-related `PZ409` handling.

Other files intentionally evolved after #61:

- `customerCheckoutService.ts`: normalized and deterministically ordered prelaunch catalog SQL, preserving custom checkout flag and parameterized publish/enablement requirements.
- `subscriptionCheckoutService.ts`: retains custom-order validation while adding early invoice eligibility checks and locked transactional rechecks to prevent orphaned payable invoices and conflicting purchases (later PRs #63 and #65).
- `monthlyAIAllowance.ts`: retains custom catalog eligibility but preserves the allowance on already-paid, accepted built-in terms after plan delisting (later #62).
- `planChangePreview.ts`: retains strict unpublished/disabled **custom** plan restrictions, with updated treatment of existing built-in plan changes.
- `tests/billingFinancialWorkflow.integration.test.ts`: expanded synthetic payment, plan-delisting, quote retry, and billing-worker tests.
- `.github/workflows/ci.yml`: current CI includes improvements beyond the historical PR.
- `docs/CUSTOM_SALES_PLAN_RUNTIME_COMPATIBILITY.md`: archived below `docs/archive/custom-plans/` instead of making its outdated pre-atomic-quota warning current advice.

**Runtime boundary:** No custom plan may currently be published. The live staging PostgreSQL constraint `billing_plans_custom_draft_only_check` requires `is_published=false` for `custom_` IDs; checkout and entitlement environment switches are independent and off by default.

Staging read-only verification on October 25: six built-in plans, zero published, zero custom, zero subscriptions and zero commercial subscription orders.

## Test evidence and remaining work

- Merged PR [#74](https://github.com/hydedfeg/TGReposter/pull/74) selectively incorporated the custom-tier compatibility work.
- The atomic quota migration and concurrency test sources are present in the integration branch.
- Existing staging full GitHub CI at `2dbbb36`: 544/544 tests passed; the corresponding Railway rebuild **FAILED** and must not be described as deployed. The previous successful Railway staging commit was `adb35d8` at audit time.
- Retain original PR branches and all historical commits; closing as superseded is **not a formal merge** and does not imply a successful production deployment.

**Outstanding launch blockers:** Controlled Supabase migration-history reconciliation and verified backup/restore; real two-account Auth acceptance; customer order/settlement certification; economic, tax, compliance and refund sign-off; explicit launch flags and production approval. Neither this audit nor closure authorizes enabling quotas, commercial AI, custom plans, billing checkout, or automatic Telegram alerts.
