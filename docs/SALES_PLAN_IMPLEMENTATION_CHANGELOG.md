# TGReposter Sales Plan — Comprehensive Implementation Changelog

**Period represented:** Sales Plan decision through technical Phases 1–11; staging integration and crypto-payment audit snapshot through 2026-10-13.  
**Record type:** GitHub changes, schemas, services, tests, CI/deployment decisions and known limitations.  
**Authoritative companion:** [Sales Plan Implementation Record](./SALES_PLAN_IMPLEMENTATION_RECORD.md).  
**Original business decisions:** [Pricing & Sales Plan](./PRICING_AND_SALES_PLAN.md).  
**Release state:** **NOT A COMMERCIAL RELEASE.** PRs #35–#45 are open/draft. Production remains on the existing `main` application/database lineage.

The "Phase 1–11" numbers below are the sequence used during implementation in this conversation, **not** the separate six-phase roadmap in the original pricing strategy. Entries are grouped by engineering milestone; don't infer a calendar-day release date from a milestone number.

## 0. Initial strategy, commercial scope and decisions

**Reference:** `docs/PRICING_AND_SALES_PLAN.md`, maintained on `main`.

### Added/approved

- Product positioning: **Telegram Content Operations Platform** for channel owners, multi-channel operators, media teams, promotion networks, and agencies.
- Six commercial tiers: Free €0, Creator €15/mo (€150/yr), Professional €39/mo (€390/yr), Business €89/mo (€890/yr), Agency €199/mo (€1,990/yr), Enterprise custom.
- Product scale meters: monitored sources, destinations, active promotion campaigns, eventual team seats, and independently metered AI.
- AI strategy: TGReposter-funded **OpenRouter** at commercial launch, compatible-model choice, a "TGReposter Recommended" default, provider-usage-based AI Units, included credits and purchased top-ups.
- Monthly included Units: Free 10, Creator 100, Professional 400, Business 1,000, Agency 2,500; custom Enterprise allowances.
- Top-ups: 500 Units €7, 2,000 €25, 5,000 €55, 10,000 €99.
- Behavior baseline: monthly included Unit reset, included-before-purchased spending, purchased balance retention across normal renewals, no destructive downgrade, cancel at term end.
- Go-to-market hypotheses: permanent Free plan, no conventional timed paid trial, Professional as Most Popular, annual pricing incentive, gradual acquisition from 10→100→1,000 paying customers, and margin/COGS instrumentation.

### Explicitly not implemented by approving the plan

Sales copy, a public commercial checkout, customer invoices, paid plans, VAT/tax handling, enterprise contracts, agency client workspaces, enforced tier quotas or validated profit margins were **not** introduced by the strategy document alone.

---

## 1. Phase 1 — Normalized commercial catalog and billing foundation

**PR:** [#35 — commercial data foundation](https://github.com/hydedfeg/TGReposter/pull/35).  
**Branch:** `feat/commercial-data-foundation`.

### Added

- `billing_plans` catalog seeded with six **unpublished** prices, source/destination/campaign limits, seat hypotheses and included AI Units.
- `billing_features` and `billing_plan_features` for separate feature state/entitlements.
- `billing_subscriptions` for owner-specific current plan, period dates and cancellation/scheduling fields.
- `ai_usage_events` with owner-scoped idempotency key, model/operation/status, costs/tokens/charged Units.
- `ai_unit_ledger` with signed included or purchased grants/consumes/adjustments/reversals and optional request link.
- Backend effective plan resolver, fail-closed for unavailable paid entitlement.
- Database RLS, direct browser-role revoke, owner principal constraints and unique keys.

### Tests and boundaries

- Plan/tenant resolver and normalized foundation schema tests.
- Staging transactional SQL dry-run, **rolled back**.
- No automatic user enrollment, published catalog, paid checkout, or live plan enforcement.

**Docs:** [Commercial foundation implementation](./COMMERCIAL_FOUNDATION_IMPLEMENTATION.md).

## 2. Phase 2 — OpenRouter commercial model registry, charging and reconciliation metadata

**PR:** [#36 — OpenRouter commercial metering](https://github.com/hydedfeg/TGReposter/pull/36).  
**Branch:** `feat/openrouter-commercial-metering`.

### Added

- `server/ai/openRouterModelCatalog.ts`: cached compatible text-capable OpenRouter model discovery, metadata/pricing checks, fallback to previously verified cache during provider outage.
- `GET /api/ai/openrouter/models` read-only authenticated model discovery.
- Backward-compatible usage-collection extension to the OpenRouter provider adapter.
- `server/billing/aiUnits.ts`: exact decimal parsing, provider cost to TG AI Unit conversion, worst-case reservation.
- `server/billing/aiBalanceService.ts`: owner-locked reserve/settle, included-before-purchased consumption, idempotent ledger entries, pending hold retention for uncertain provider cost and overage/debt safeguards.
- `server/billing/commercialOpenRouterService.ts`: reserve→OpenRouter→verified settlement composition.
- Extra `ai_usage_events` provider generation reference/reconciliation note and generation uniqueness.

### Tests and boundaries

- Tests for Unit conversion, provider response, model catalog cache, orchestration and ambiguous final charges.
- Staging migration dry-run, **rolled back**.
- **Not mounted** in legacy `/api/ai/curate` or promotion AI routes; legacy personal-key AI stayed operational.

**Docs:** [OpenRouter Commercial Metering](./OPENROUTER_COMMERCIAL_METERING.md).

## 3. Phase 3 — Backend-authoritative allowance and purchase credit ledger

**PR:** [#37 — monthly credits and top-up orders](https://github.com/hydedfeg/TGReposter/pull/37).  
**Branch:** `feat/ai-monthly-credits`.

### Added

- `ensureMonthlyAIAllowance` for published Free/paid plans with UTC Free-month, subscription-cycle monthly and anchored annual-month subperiod handling.
- Backend-only prevention of overlapping credit grants and duplicate month/owner event keys.
- `billing_ai_topup_packs` catalog for four unpublished packs.
- `billing_ai_topup_orders` normalized, unique-invoice, owner-linked product/price snapshots.
- Verified `fulfillVerifiedTopup` that checks invoice `paid` state and exact matching confirmed transaction and posts purchased credits atomically.
- `openRouterReconciliation.ts`: provider generation usage-cost lookup, bounded pending-request worker and conservative handling of missing/unverified cost.

### Tests and boundaries

- Credits across cycle boundaries, unpaid/mismatched order rejection, duplicate grant guard and cost reconciliation tests.
- Combined staging SQL dry-run, **rolled back**.
- No customer top-up checkout, no FX quote yet, no automatic reconciler schedule.

**Docs:** [AI allowances and verified top-up fulfillment](./AI_ALLOWANCE_AND_TOPUP_FULFILLMENT.md).

## 4. Phase 4 — Market-derived checkout quotes and verified subscription terms

**PR:** [#38 — subscription checkout foundation](https://github.com/hydedfeg/TGReposter/pull/38).  
**Branch:** `feat/subscription-checkout-foundation`.

### Added

- `checkoutQuoteService.ts`: Kraken public USDTEUR ask, bid/ask sanity check, five-minute quote lifetime, 1.5% indicative buffer, six-decimal amount rounding via integer/decimal arithmetic.
- `billing_fx_quotes`, `billing_subscription_orders`, `billing_subscription_terms`.
- `createSubscriptionCheckoutInvoice`: quote-driven USDT invoice creation through existing crypto payment infrastructure.
- `prepareSubscriptionOrder` and strengthened top-up order preparation: owner, product, price, quote, pending invoice, currency conversion and single-use constraints.
- `fulfillVerifiedSubscription`: verify paid invoice **and** owned confirmed transfer; create active or scheduled paid term and subscription snapshot transactionally.
- `activateDueSubscriptionTerm` helper; guard against billing-interval and active mid-cycle plan changes.

### Tests and boundaries

- Rate parsing, spread, precision, quote expiry, invoice uniqueness, same-owner referential integrity and paid renewal state tests.
- Staging multi-migration dry-run, **rolled back**.
- No customer purchase API, no approved proration/refund/VAT or production quote activation.

**Docs:** [Subscription Checkout Foundation](./SUBSCRIPTION_CHECKOUT_FOUNDATION.md).

## 5. Phase 5 — Controlled billing worker and retry durability

**PR:** [#39 — billing operations worker](https://github.com/hydedfeg/TGReposter/pull/39).  
**Branch:** `feat/billing-operations-worker`.

### Added

- `billingOperationsWorker.ts`, `billingOperationsScheduler.ts`: poll pending verified subscription orders, top-ups, due renewal terms, and included AI allowances.
- Global PostgreSQL advisory scheduler lock and pre-existing per-owner transaction locks.
- `billing_operation_attempts`, bounded candidate discovery, per-item failure isolation and exponential-ish retry delays.
- Feature switches: `TGREPOSTER_BILLING_WORKER_ENABLED`, `TGREPOSTER_SUBSCRIPTION_CHECKOUT_ENABLED`, `TGREPOSTER_COMMERCIAL_TOPUPS_ENABLED`, `TGREPOSTER_COMMERCIAL_AI_ENABLED`.

### Tests and boundaries

- Worker stage ordering, independent failures, timer behavior, retry windows, migration security and duplicate-run regression tests.
- Combined staging migration dry-run, **rolled back**.
- Worker **not launched**; the crypto watcher still only observes/records transfers.

**Docs:** [Billing Operations Worker](./BILLING_OPERATIONS_WORKER.md).

## 6. Phase 6 — Owner-specific Billing & Usage UI and API

**PR:** [#40 — customer billing dashboard](https://github.com/hydedfeg/TGReposter/pull/40).  
**Branch:** `feat/customer-billing-dashboard`.

### Added

- Authenticated `GET /api/billing/overview` with backend-derived owner principal, owner-filtered subscriptions, effective plan/feature state, usage counts, included and purchased AI Units, last 12 commercial orders.
- Safe 401/no-session, 503/unavailable-schema and generic operational error responses; private/no-store cache handling.
- `src/components/BillingOverview.tsx`, navigation placement under Personal setup, mobile adaptation.
- English, Persian, Arabic and Russian localization; abort/refresh handling and prelaunch/not-ready/empty states.

### Safeguards and omissions

- No owner selection from request, no raw invoice-chain hashes, wallet addresses, personal prompts or provider keys.
- No fake "buy", "cancel", "upgrade" action without a working backend.
- No user-seat number without a real organization meter.
- Informational usage counters are **not** backend limits enforced against existing business operations.

**Docs:** [Customer Billing Dashboard](./CUSTOMER_BILLING_DASHBOARD.md).

## 7. Phase 7 — End-of-term cancellation, renewal preservation and expiry

**PR:** [#41 — subscription lifecycle safety](https://github.com/hydedfeg/TGReposter/pull/41).  
**Branch:** `feat/subscription-lifecycle-safety`.

### Added

- `subscriptionLifecycleService.ts`, owner-locked end-of-paid-term cancellation and reversal.
- No premature paid access removal; refuse cancellation changes when prepaid scheduled term/pending financial orders need resolution.
- Backend-only lifecycle events `cancel_scheduled`, `cancel_reversed`, `expired` in `billing_subscription_events`.
- Expired snapshot reconciliation after due renewals; prevent silently forfeiting a missed already-paid renewal.
- Disabled-by-default owner-only `POST /api/billing/subscription/cancellation`.
- Billing worker gains an `expirations` stage and retry support; subscription checkout rejects conflicts with scheduled cancellation.

### Tests and boundaries

- Duplicate cancel/reverse, prepaid/pending conflicts, expiration, owner spoofing rejection, route feature gate, private audit FK.
- Staging multi-migration dry-run, **rolled back**.
- No customer-facing cancellation button, automatic refunds or mid-cycle plan changes.

**Docs:** [Subscription Lifecycle Safety](./SUBSCRIPTION_LIFECYCLE_SAFETY.md).

## 8. Phase 8 — Non-binding plan change estimate and synthetic financial fulfillment

**PR:** [#42 — financial validation](https://github.com/hydedfeg/TGReposter/pull/42).  
**Branch:** `feat/plan-change-financial-validation`.

### Added

- `planChangePreview.ts` with remaining-term upgrade difference rounded in EUR cents, downgrade illustration at term end, explicit no-refund/no-charge behavior.
- Feature-gated `GET /api/billing/subscription/change-preview`, validating published plans and excluding prepaid renewals, pending invoices or canceling subscriptions.
- Optional test-only PostgreSQL transaction client injection for subscription fulfillment, monthly allowances and top-up fulfillment.
- Synthetic PGlite scenario: unpaid invoice denied; confirmed transfer activates one paid term; a monthly grant is issued exactly once; a top-up credits once; repeat and cross-tenant attempts blocked.

### Tests and boundaries

- Fractional-cent arithmetic, terminated subscriptions, multi-owner HTTP guard, mismatch and double-credit prevention.
- Staging query/migration SQL transaction and rollback passed.
- Vercel preview/build validation reported green.
- **No payable price, upgrade/downgrade purchase, billing interval transition or refund path enabled.**

**Docs:** [Plan Change Financial Validation](./PLAN_CHANGE_FINANCIAL_VALIDATION.md).

## 9. Phase 9 — Merge reconciliation and real staging rollout

**PR:** [#43 — combined staging integration](https://github.com/hydedfeg/TGReposter/pull/43).  
**Branch:** `feat/commercial-staging-integration`.  
**Staging Railway:** `TGReposter Staging`, source pinned to CI-verified commit at rollout.

### Changed

- Reconciled newer `feat/crypto-payment-infrastructure` runtime (additional scanner safety/alerts and notification-test capability) with commercial Phase 1–8 branch in a two-parent merge.
- Preserved both super-admin Payment Operations and customer Billing & Usage screens.
- Fixed merge-introduced duplicate `CreditCard` import and commercial provider union error.
- Added GitHub Actions CI checks; passed TypeScript lint, tests and build before staging rollout.
- Staging Railway deployed combined app successfully, with no commercial feature switches enabled.
- Applied seven commercial migrations to **staging Supabase only** in dependency order; then renamed migration filenames in integration Git history to the actual versions assigned by Supabase.
- Verified 13 commercial tables RLS/private grants, six unpublished plans, four unpublished top-up packs, zero auto-created commercial orders, subscriptions or AI Units.
- Staging crypto watcher startup preflight passed BSC, Ethereum and TON; it remained independent of disabled billing worker.

### Exact staging migration filename history

| Original feature-branch filename | Applied version used in staging integration |
|---|---|
| `20261010163500_create_commercial_foundation.sql` | `20261012144506_create_commercial_foundation.sql` |
| `20261010175200_add_ai_usage_reconciliation.sql` | `20261012144528_add_ai_usage_reconciliation.sql` |
| `20261010182000_add_ai_topup_packs.sql` | `20261012144532_add_ai_topup_packs.sql` |
| `20261010182100_add_ai_topup_orders.sql` | `20261012144536_add_ai_topup_orders.sql` |
| `20261010184000_subscription_checkout_foundation.sql` | `20261012144539_subscription_checkout_foundation.sql` |
| `20261010191500_billing_operation_retries.sql` | `20261012144544_billing_operation_retries.sql` |
| `20261012130000_subscription_lifecycle_events.sql` | `20261012144548_subscription_lifecycle_events.sql` |

**Operational warning:** Old stacked PRs still contain original filenames. Do not merge both versions blindly or replay already-applied schema into staging; reconcile migration history for each target database before production.

**Docs:** [Phase 9 Staging Integration](./PHASE_9_COMMERCIAL_STAGING_VALIDATION.md).

## 10. Phase 10 — Staging financial-record invariants and synthetic HTTP acceptance

**PR:** [#44 — financial acceptance](https://github.com/hydedfeg/TGReposter/pull/44).  
**Branch:** `feat/billing-financial-acceptance-tests`.

### Added/tests

- Express HTTP tests with two **simulated** independently authenticated principals against PGlite loaded with the commercial SQL migrations: separate subscriptions, resource counts and AI balances; no unauthorized owner override or anonymous billing read.
- Real subscription fulfillment function tested against wrong token, recipient, amount, confirmation depth and cross-owner synthetic payment proof.
- Idempotent activation and top-up retry checks: one term/credit regardless of repeated correct confirmation.
- Reproducible `tests/sql/phase10_staging_billing_acceptance.sql`; executed against live **staging PostgreSQL** inside explicit `BEGIN`/`ROLLBACK`, asserting unique transfer-event identity and cross-owner invoice FK denial.
- All generated staging fixtures discarded; no paid account created.

### Verification honesty

- GitHub lint/test/build passed.
- Earlier attempted advisory-lock concurrency probe using separate connector requests was **inconclusive** and **not** reported as a real concurrent transaction proof.
- Real Supabase login and blockchain transfer remained untested.

**Docs:** [Phase 10 Financial Acceptance](./PHASE_10_BILLING_FINANCIAL_ACCEPTANCE.md).

## 11. Phase 11 — Actual two-session PostgreSQL concurrency

**PR:** [#45 — concurrency and staging auth acceptance harness](https://github.com/hydedfeg/TGReposter/pull/45).  
**Branch:** `feat/live-staging-acceptance-harness`.

### Added/tests

- Dedicated `postgres-financial-concurrency` GitHub Actions job with ephemeral PostgreSQL 16; test runner refuses non-loopback/non-disposable DB URL.
- Two distinct sessions proven with `select pg_backend_pid()`; lock contention and availability after unlock confirmed.
- Two simultaneous verified subscription fulfillment attempts create one paid term; concurrent included AI grant creates one Unit grant; concurrent purchased top-up settlement creates one purchase ledger entry.
- Cross-owner fulfillment rejected.
- Guarded `scripts/verifyStagingBillingAuth.ts`, restricted to a known staging HTTPS hostname, accepts only two existing staging-only confirmed credentials through the operator's environment; intended to verify two real Supabase sessions, invalid JWT and owner-scoped billing views.

### CI fix and remaining work

- Initial GitHub CI concurrency test **passed** but TypeScript reported a missing `PoolClient.processID` type.
- Replaced this with server-side `pg_backend_pid()` and reran CI; both standard TypeScript/test/build and PostgreSQL concurrency jobs passed.
- **The staging real-Auth script was not executed** because two real account credentials were unavailable; no sign-in secrets were stored.
- Install logs reported **9 npm advisories** (5 moderate, 3 high, 1 critical); not yet a reviewed, patched vulnerability disposition.
- No actual blockchain-paid commercial order was executed.

**Docs:** [Phase 11 Live Staging Acceptance](./PHASE_11_LIVE_STAGING_ACCEPTANCE.md).

## 12. Follow-up crypto-payment audit (October 13, 2026)

The read-only backend/database review immediately following the Phase 11 work is important context for Sales Plan integration. It was **not** a further commercial feature release.

### Observed

- Staging Railway serves the combined crypto/commercial integration branch; production still serves `main`.
- Staging stores **2 BSC invoices**: one `paid`, one `expired`.
- The `paid` invoice has one associated recorded, confirmed matching BSC transfer; five recorded payment lifecycle events in total.
- **Zero commercial subscription or AI top-up orders** are attached to those invoices.
- Scanner checkpoint rows for BSC, Ethereum and TON were recent at inspection time.
- Staging contained 13 commercial tables and seven crypto payment tables with RLS, with direct browser table access denied.
- Staging commercial catalog: six plans and four top-up packs seeded but **unpublished**, with zero subscriptions, quotes, order records, AI usage or Unit credits.
- Production had no commercial/crypto-payment schema.
- The paid BSC invoice should be reviewed for context (possibly infrastructure testing), **not automatically turned into a subscription**.
- Paid-without-a-commercial-order is not one of the existing dashboard's explicit reconciliation checks; add a finance reconciliation rule before customer checkout.

### Still only in-progress

An additional `feat/phase12-payment-audit-acceptance` branch contains work in progress on dependency-audit and recorded network fixture tooling. It is **not** described here as tested, launched or merged.

## 13. Cross-cutting security and operational decisions

### Preserved

1. Every financial purchase/credit remains bound to the backend-derived account principal; other users' destinations/inboxes/campaigns/credits stay isolated.
2. All money and credit amounts are parsed or stored using exact decimal/integer arithmetic; USDT and EUR are never assumed to be interchangeable.
3. Payment scanning stays plan-agnostic; finance services independently reverify owner/invoice/confirmed transfer.
4. No client-supplied wallet transaction hash is enough to allocate a subscription or Unit balance.
5. Scanners use network-specific confirm requirements and durable cursors; invoice amount reservations reduce ambiguous transfers.
6. Every added financial table is RLS protected and browser writes are disallowed.
7. Duplicate request/event handling uses unique keys, row locks and per-owner advisory locks.
8. An uncertain OpenRouter provider cost must not silently become a zero charge.
9. No auto-delete of resources is implemented for downgrades/cancellations.
10. Production migration/feature flags were deliberately **not** changed by this feature work.

### Added but not yet proven in operation

- Prepaid renewal/expiry handling needs missed-term/dispute operations and staging transactional acceptance.
- Background billing worker/plan limit gates need controlled test environment rollout.
- Paid commercial AI orchestrator needs mounting and provider accounting tests with live representative usage.
- Financial reporting must reconcile paid crypto invoices against signed commercial order records and actual entitlements.
- True customer-facing quote/consent/purchase/refund workflow requires VAT and legal review.

## 14. Prelaunch status matrix

| Product area | Code/schema/tests | Deployed to staging | User purchase/enforcement enabled |
|---|---|---|---|
| Tier catalog, AI prices, features | Yes | Yes | **No**; unpublished |
| Crypto invoice/matching/scanner | Yes | Yes | Super-admin infrastructure only |
| Customer Billing & Usage overview | Yes | Yes | Read-only preview |
| Commercial OpenRouter selection/metering | Yes | Parts of code | **No**; not mounted to AI workflow |
| Monthly included credits | Yes | Backend/schema | **No** |
| Verified AI top-up order/credit | Yes | Backend/schema | **No** |
| EUR→USDT quote and subscription purchase | Yes, internal | Backend/schema | **No checkout route** |
| Paid term/renewal worker | Yes | Backend code | **No**, inactive |
| Cancellation, expiry, change estimate | Yes, gated | Backend code | **No customer action** |
| Actual two-session PostgreSQL concurrency | Automated tests passed | Tested in disposable CI Postgres | N/A |
| Two real staging Supabase customer logins | Harness written | Not executed | N/A |
| Full real USDT→customer entitlement acceptance | Not demonstrated | **Not verified** | **No** |
| Production payments and commercial billing | Unreleased | No | **No** |

## 15. Release checklist carried forward

- [x] Publish the **code and database foundation** in the feature/stacked PRs.
- [x] Merge-tested staging integration without dropping recent crypto watcher improvements.
- [x] Apply new commercial schema to staging and reconcile migration version filenames.
- [x] Verify private table privileges and no automatic product publication.
- [x] Validate synthetic payment evidence/idempotency and concurrent Postgres fulfillment/credits.
- [ ] Complete two-actual-account staging Auth acceptance.
- [ ] Approve VAT, receipt, stablecoin compliance, FX buffer, refunds/chargebacks and prepaid-terms policy.
- [ ] Complete a controlled, independently verified real USDT purchase and full fulfillment flow.
- [ ] Expose authenticated consent/checkout UI/API with quote, correct taxes, payment instructions and recovery.
- [ ] Mount commercial AI charge pipeline and test unknown-cost reconciliation.
- [ ] Implement production backend tier limits and downgrade-safe resource preservation.
- [ ] Remediate/report high/critical dependency advisories.
- [ ] Resolve paid/unlinked invoice, unassigned transfer, failed/missed renewal and financial dispute workflows.
- [ ] Review/merge stacked PRs into a production release branch with correct migration history and rollback plan.
- [ ] Apply production schema **only after release approval**, publish products and enable flags in controlled steps.
- [ ] Confirm customer onboarding and commercial metrics before claiming successful launch.

## 16. Cross-reference: all stacked pull requests

| Phase | PR | Branch | Subject |
|---|---|---|---|
| 1 | [#35](https://github.com/hydedfeg/TGReposter/pull/35) | `feat/commercial-data-foundation` | Commercial data foundation |
| 2 | [#36](https://github.com/hydedfeg/TGReposter/pull/36) | `feat/openrouter-commercial-metering` | Provider-funded AI metering |
| 3 | [#37](https://github.com/hydedfeg/TGReposter/pull/37) | `feat/ai-monthly-credits` | Monthly grants and verified top-ups |
| 4 | [#38](https://github.com/hydedfeg/TGReposter/pull/38) | `feat/subscription-checkout-foundation` | FX quotes and subscriptions |
| 5 | [#39](https://github.com/hydedfeg/TGReposter/pull/39) | `feat/billing-operations-worker` | Disabled financial scheduler |
| 6 | [#40](https://github.com/hydedfeg/TGReposter/pull/40) | `feat/customer-billing-dashboard` | Read-only Billing & Usage |
| 7 | [#41](https://github.com/hydedfeg/TGReposter/pull/41) | `feat/subscription-lifecycle-safety` | Cancellation and expiry safety |
| 8 | [#42](https://github.com/hydedfeg/TGReposter/pull/42) | `feat/plan-change-financial-validation` | Non-binding price estimates |
| 9 | [#43](https://github.com/hydedfeg/TGReposter/pull/43) | `feat/commercial-staging-integration` | Crypto+commercial combined staging branch |
| 10 | [#44](https://github.com/hydedfeg/TGReposter/pull/44) | `feat/billing-financial-acceptance-tests` | Synthetic and staging SQL acceptance |
| 11 | [#45](https://github.com/hydedfeg/TGReposter/pull/45) | `feat/live-staging-acceptance-harness` | Real Postgres concurrency, Auth harness |

**PR states on record date:** all eleven open and draft. The integration was deployed to **staging**, not merged into production. A draft PR is not a production release.

---

**Changelog conclusion:** Through Phase 11, the project's Sales Plan progressed from a commercial pricing specification to a tenant-isolated, server-authored and extensively tested **staging billing foundation**. The business still requires genuine customer checkout, financial/regulatory signoff, end-to-end live payment/entitlement validation, operational handling of exceptions and controlled production deployment.
