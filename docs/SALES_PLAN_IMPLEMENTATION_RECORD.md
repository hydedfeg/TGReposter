# TGReposter Sales Plan — Comprehensive Implementation & Architecture Record

**As-of:** 2026-10-13  
**Scope:** Commercial/Sales Plan implementation carried out in the project conversation through Phases 1–11, plus the existing crypto-payment infrastructure on which it depends.  
**Canonical business policy:** [Pricing & Sales Plan](./PRICING_AND_SALES_PLAN.md) (copied unchanged from `main` into this documentation branch).  
**Detailed chronological history:** [Sales Plan Implementation Changelog](./SALES_PLAN_IMPLEMENTATION_CHANGELOG.md).  
**Repository:** [hydedfeg/TGReposter](https://github.com/hydedfeg/TGReposter).  
**Documentation status:** Historical and technical record, **not a commercial-launch authorization**.

> **Read this before drawing conclusions:** "Implemented" means code/schema/tests were developed and committed to a feature branch. "Deployed to staging" means present in the connected staging Railway/Supabase environments. "Enabled for customers" means a complete usable, policy-approved commercial workflow. These are three different states. None of the commercial checkout, TGReposter-funded AI charging, top-up purchases, plan-limit enforcement or subscription changes has been enabled for customers.

## 1. Executive summary

TGReposter is positioned as a **Telegram Content Operations Platform**, supporting source monitoring, filtered content inbox, AI transformation, editorial review, publishing, and promotion/distribution. The Sales Plan is designed to monetize operational scale (source channels, destinations, active campaigns, collaboration) and provider-funded AI usage, rather than sell a simple Telegram forwarding bot.

The implementation delivered a normalized billing foundation; backend plan catalog; OpenRouter model discovery, cost-aware metering and reconciliation components; monthly AI allocations; verified crypto-invoice-linked subscription and AI top-up order processing; FX quoting; an inactive retryable billing worker; a read-only customer billing dashboard; non-destructive subscription lifecycle operations; a non-binding plan-change preview; and increasing layers of synthetic and real-PostgreSQL acceptance testing.

The underlying **USDT payment infrastructure** is a distinct, pre-existing subsystem. Its network scanner is operating in staging, with persisted invoice and transaction evidence. Commercial billing has been integrated with its schema and code in a **staging-only** branch, but the customer payment-to-entitlement flow remains disabled pending acceptance, compliance and policy decisions.

### Current environment inventory

| Environment | Code | Payment scanning | Commercial schema | Commercial launch |
|---|---|---|---|---|
| **Railway/Supabase staging** | `feat/commercial-staging-integration` | Configured and recently active on BSC, Ethereum and TON | **Seven new commercial migrations applied** | **Disabled**; products unpublished; no commercial orders/subscriptions or AI credits |
| **Railway/Supabase production** | Railway branch `main` | Commercial crypto-payment tables not installed | **Not installed** | **Not launched** |
| **Development feature stack** | Draft PRs **#35–#45** | Automated code/fixture tests | Migrations source-controlled | Development only |

The staging state above was verified via read-only Supabase and Railway inspection in the project conversation on October 13, 2026; it is a **point-in-time observation**, not an availability guarantee.

## 2. Approved Sales Plan and product policy

The original Sales Plan is the decision source; this document records what has or has not been implemented against it. The pricing and feature entitlements below are a **planning baseline, not an offer currently available to buy**.

### 2.1 Subscription catalog

| Plan | Monthly | Annual total | Included AI Units / monthly allowance | Sources | Destinations | Active campaigns | Proposed seats |
|---|---:|---:|---:|---:|---:|---:|---:|
| Free | €0 | €0 | 10 | 3 | 1 | 0 | 1 |
| Creator | €15 | €150 | 100 | 15 | 3 | 1 | 1 |
| Professional | €39 | €390 | 400 | 75 | 15 | 10 | 3 |
| Business | €89 | €890 | 1,000 | 250 | 50 | 50 | 10 |
| Agency | €199 | €1,990 | 2,500 | 1,000 | 200 | 200 | 30 |
| Enterprise | Contract | Contract | Contract | Custom | Custom | Custom | Custom |

- Professional is the intended **Most Popular** paid tier.
- Annual plans are approximately two months cheaper than paying monthly.
- Free is intended to be permanent and usable without a payment card; no conventional paid-plan trial at launch.
- Agency differentiation should eventually include isolated client workspaces; Enterprise requires negotiated governance, integrations, support and SLA.
- Team-seat/organization metering, production plan-limit enforcement, monitoring priority by tier, downgrade-safe resource pausing and several advanced entitlement features are **not finished**. Do not market roadmap capabilities as live.
- Paid upgrades are **intended** to take effect immediately with approved proration; downgrades at the next renewal; cancellation at the paid period end. Data must not be automatically deleted for a plan change.

### 2.2 AI funding and usage economics

The approved commercial AI direction is **TGReposter-funded OpenRouter as the single commercial AI gateway**, with a broad compatible text-model catalog, a recommended default model, and optional manual model selection.

- Reference accounting conversion: **100 TG AI Units approximately equal US$1 of provider inference cost** (internal baseline, subject to economics review).
- Included monthly Units are consumed before purchased Units; included Units reset by billing cycle.
- Purchased Units are a separate ledger balance and are intended to survive an ordinary subscription renewal.
- Expending AI Units must not shut off permitted non-AI workflow features.
- This commercial direction does **not** mean the older live Gemini/OpenRouter personal-API-key curation routes have been removed or migrated. The new provider-funded curation orchestration is **not wired into those live routes**.

### 2.3 Proposed top-up products

| Pack | AI Units | Catalog price |
|---|---:|---:|
| AI Mini | 500 | €7 |
| AI Plus | 2,000 | €25 |
| AI Pro | 5,000 | €55 |
| AI Max | 10,000 | €99 |

Both the six plan records and four top-up packs were seeded in staging as **unpublished**. Enterprise/custom allowance and top-up transfer/refund/expiry terms remain policy work.

### 2.4 Sales and GTM policy (planned, not launched)

Target initial buyers: operators of multiple Telegram channels and small media teams, particularly those managing about 3–30 channels and monitoring many outside sources. The suggested acquisition path is multi-channel outreach, partnerships, communities, SEO/content, referrals and a founding-customer offer. The plan recommends starting with ten paying accounts, then validating activation, churn, retention, margins and support before scaling to 100 and 1,000.

The business strategy includes a gross-margin **design target** around 80%, **not an observed financial result**. Launch discounts, VAT, customer invoices, refund policy, conversion/spread economics, purchased-credit expiry, contractual SLA, and plan enforcement need final approval.

## 3. Implemented software and database architecture

### 3.1 Layered service flow

~~~text
Existing user authentication (Supabase Auth / supported legacy sessions)
      | ownerPrincipalForUser(req.user)
      v
Authenticated customer Billing & Usage API — READ ONLY
      |
      +--> billing_plans / plan features and effective-plan resolver
      +--> resource counts / AI usage and balance ledgers
      +--> subscription and top-up order status (owner-scoped)

Future controlled customer checkout (NOT MOUNTED)
      |
      v
Published server catalog + short-lived signed-by-server DB FX quote
      |
      v
Plan-agnostic CryptoPaymentInvoiceService — unique exact USDT amount
      |
      v
BSC / Ethereum EVM RPC, TON indexer
      |
      v
CryptoPaymentWatcher -> confirmed invoice + owned chain event
      |
      v
Disabled-by-default billing worker (polling)
      |
      +--> verified subscription order -> subscription term/snapshot
      +--> verified AI top-up order -> purchased AI Unit ledger grant
      +--> due paid renewal activation -> included monthly grant
      +--> expired paid term reconciliation (if separately enabled)

New TGReposter-funded OpenRouter service (NOT MOUNTED)
      |
      v
Verified model catalog -> reserve balance -> provider -> cost settlement
                                          -> pending generation reconciliation
~~~

### 3.2 Normalized commercial data model

**Thirteen** commercial tables were introduced on staging, independent of the seven existing crypto-payment tables.

| Table | Purpose |
|---|---|
| `billing_plans` | Tier prices, limits, monthly included AI Units, publication state |
| `billing_features` | Named capabilities and release state |
| `billing_plan_features` | Which plan can use each capability |
| `billing_subscriptions` | One owner-specific current subscription snapshot |
| `ai_usage_events` | One idempotent AI request and provider usage/cost record |
| `ai_unit_ledger` | Signed, owner-scoped included/purchased AI grant, consume, reverse or adjust entries |
| `billing_ai_topup_packs` | Unpublished catalog of purchasable AI Unit packs |
| `billing_ai_topup_orders` | One-owner, one-invoice AI top-up purchase and fulfillment |
| `billing_fx_quotes` | Server-issued EUR-to-USDT price snapshots with expiration |
| `billing_subscription_orders` | Invoice/quote-linked paid-plan orders |
| `billing_subscription_terms` | Historical paid entitlement periods, active/scheduled/completed |
| `billing_operation_attempts` | Retry/next-attempt ledger for failed worker operations |
| `billing_subscription_events` | Owner-scoped cancellation, reversal and expiry audit |

Important constraints actually present in schema or backend:
- `owner_principal` is propagated from authenticated server identity, not a user-supplied account selector.
- Composite same-owner FKs prevent cross-owner invoice/quote/event references.
- Unique `(owner_principal, request_key)` AI usage, `(owner_principal, event_key)` credit transactions, single-use commercial invoices/quotes, and one active/one scheduled subscription term per owner are used to prevent duplicate issuance.
- RLS is enabled on all 13 new tables; direct `anon`/`authenticated` access is revoked. Backend/service-authorized access is required.
- No subscription is silently created on schema installation and no plan or pack is automatically published.
- Commercial tables are related to crypto invoices, but the crypto scanner has **no authority** by itself to grant an entitlement.

### 3.3 Existing underlying crypto-payment model (separate from Sales Plan implementation)

Seven tables: `crypto_payment_invoices`, `crypto_payment_transactions`, `crypto_payment_events`, `crypto_payment_network_state`, `crypto_payment_amount_reservations`, `crypto_payment_unassigned_transfers` and `crypto_payment_operational_alerts`.

Supported chains are BSC, Ethereum and TON; USDT token identifiers are allow-listed; EVM networks check chain IDs and token metadata, TON checks the canonical Jetton master/indexed transfers. Backend invoice generation reserves a small unique six-decimal USDT amount discriminator per receiving merchant/network/token. DB uniqueness on `(network,tx_hash,event_index)` prevents blockchain event reassignment; scanner cursors preserve overlap, and operations use PostgreSQL advisory locks.

Payment operations under `/api/crypto-payments` are **super-admin-only**, including the infrastructure invoice-create endpoint. Network preflight, manual scan, invoices, overview, alert journal, optional Telegram admin notifications and unmatched-transfer review all exist. No custody/private wallet keys are needed by the reader.

**Audit observation, not commercial revenue:** On October 13 the staging DB contained **two BSC invoices** (one `paid` with a matching confirmed recorded transaction, one `expired`), five crypto events, and no subscription or top-up order linked to either invoice. This demonstrates persisted blockchain monitoring, not a paid commercial subscription or independent chain-explorer verification. There were recent scan checkpoints for all three networks. See [Crypto Payments architecture](./CRYPTO_PAYMENTS.md).

## 4. Engineering Phases 1–11: shipped to branches, not customer launch

The phase numbers below refer to **this implementation conversation**. They are different from the six-phase suggested roadmap in the original Sales Plan, whose Phase 3 is plan enforcement and Phase 4 is general billing.

### Phase 1 — Commercial data foundation

**Branch/PR:** [`feat/commercial-data-foundation` / #35](https://github.com/hydedfeg/TGReposter/pull/35).

- Added six-plan seeded catalog, normalized feature registry, owner-specific subscription snapshot and append/audit-friendly AI usage and Unit ledger.
- Added backend plan eligibility resolver that fails closed for inactive/expired/unpublished entitlements.
- Private/RLS browser denial; owner-scoped keys and FK integrity.
- Created initial schema tests and tenant/plan resolver tests.
- Source: `server/billing/planCatalog.ts`, `docs/COMMERCIAL_FOUNDATION_IMPLEMENTATION.md`.
- **Not done:** auto-enrollment, enabled plan enforcement, actual AI credits or checkout.

### Phase 2 — OpenRouter commercial metering

**Branch/PR:** [`feat/openrouter-commercial-metering` / #36](https://github.com/hydedfeg/TGReposter/pull/36).

- Added dynamic compatible-text-model catalog fetched/cached from OpenRouter.
- Extended provider adapter to capture model/generation IDs and verified usage without breaking legacy BYOK signatures.
- Implemented exact decimal→Unit cost conversion, pending cost reservations, transactional owner-specific included-before-purchased consumption and actual-cost settlement.
- Added generation reconciliation metadata, idempotent provider-generation index, safeguards around unknown cost, retained reservation holds, and overage/debt handling.
- Added read-only authenticated model-discovery API `GET /api/ai/openrouter/models`.
- Main service: `server/billing/commercialOpenRouterService.ts`. This orchestrator is **not mounted into live AI curation or promotion endpoints**.
- Documentation: `docs/OPENROUTER_COMMERCIAL_METERING.md`.

### Phase 3 — Monthly AI allowances, top-up orders, generation-cost reconciliation

**Branch/PR:** [`feat/ai-monthly-credits` / #37](https://github.com/hydedfeg/TGReposter/pull/37).

- Added backend-only included AI grant service `ensureMonthlyAIAllowance` based on published plan and authoritative billing period.
- Free: UTC month; monthly paid: subscription period; annual paid: twelve anchored monthly windows inside annual period.
- Disabled grants where plans are unpublished; fail on overlapping grants and Enterprise unspecified allowance.
- Added private four-pack top-up catalog and invoice-associated top-up order/verified fulfillment. Grant event `topup:order:<order-id>` is unique and ledger posting/fulfillment is atomic.
- Implemented OpenRouter generation lookup and pending request reconciliation; absent/failed lookup is **not** zero-cost settlement. Reconciler was not scheduled.
- Documentation: `docs/AI_ALLOWANCE_AND_TOPUP_FULFILLMENT.md`.

### Phase 4 — Secure quotes, subscription checkout domain and paid terms

**Branch/PR:** [`feat/subscription-checkout-foundation` / #38](https://github.com/hydedfeg/TGReposter/pull/38).

- Added Kraken USDTEUR spot **ask**-based server quote with bid/ask safety checks, 1.5% volatility buffer, ceiling-to-six-decimal USDT and five-minute expiry.
- Added `billing_fx_quotes`, `billing_subscription_orders`, `billing_subscription_terms`.
- Added backend-only quote→invoice composition, owner/amount/product matching, invoice single-use safeguards across subscriptions/top-ups.
- Implemented transaction-locked `fulfillVerifiedSubscription`: requires paid invoice **and** confirmed, precisely matching blockchain transfer; writes paid term and current snapshot atomically.
- Preserves active access when paying early for a renewal by creating a scheduled future term; rejects unapproved mid-cycle plan/interval changes.
- Documentation: `docs/SUBSCRIPTION_CHECKOUT_FOUNDATION.md`.
- **Not done:** customer purchase route, approved taxes, provider payment execution, refunds, final price policy.

### Phase 5 — Inactive billing operations and retries

**Branch/PR:** [`feat/billing-operations-worker` / #39](https://github.com/hydedfeg/TGReposter/pull/39).

- Added backend polling worker and scheduler for verified subscription orders, verified top-ups, due renewals and included monthly grants.
- Uses global scheduler advisory lock, per-owner fulfillment lock, bounded batch sizes and isolated failures.
- Added `billing_operation_attempts` for backoff and durable retry records; logs sanitize owner/payment identifiers.
- Gated by backend-only commercial switches, not started when disabled.
- Documentation: `docs/BILLING_OPERATIONS_WORKER.md`.

### Phase 6 — Authenticated read-only Billing & Usage workspace

**Branch/PR:** [`feat/customer-billing-dashboard` / #40](https://github.com/hydedfeg/TGReposter/pull/40).

- Added `GET /api/billing/overview`, deriving identity via `ownerPrincipalForUser(req.user)` and not accepting an owner override.
- Owner-filtered plan and subscription state, enabled source/destination counts, active campaigns, AI balances and 12 latest commercial orders.
- Frontend `src/components/BillingOverview.tsx` integrated into authenticated personal setup desktop/mobile navigation and localized in English, Persian, Arabic and Russian.
- Privacy: no wallet, raw token or provider key output; private, no-store response; missing-schema/error states instead of fabricated balances.
- Team seats deliberately **not counted** until an authoritative organization model exists.
- Read-only: no buy/upgrade/cancel controls fabricated.
- Documentation: `docs/CUSTOMER_BILLING_DASHBOARD.md`.

### Phase 7 — Safe subscription cancellation and expiry

**Branch/PR:** [`feat/subscription-lifecycle-safety` / #41](https://github.com/hydedfeg/TGReposter/pull/41).

- Added end-of-term cancellation/reversal on an active paid term, behind an explicit disabled-by-default feature gate.
- Rejects conflicting prepaid renewals/pending payments; idempotent owner-locked changes; no early removal of paid access.
- Added private `billing_subscription_events` audit table for scheduled cancellation, reversal and expiry.
- Reconciles expired subscription snapshots after attempting due renewal activation; missed prepaid terms require manual financial investigation.
- Gated authenticated `POST /api/billing/subscription/cancellation`, **no live customer control**.
- Worker now orders subscription, top-up, renewal, expiry and allowance stages.
- Documentation: `docs/SUBSCRIPTION_LIFECYCLE_SAFETY.md`.

### Phase 8 — Non-binding plan-change estimate and synthetic financial integration

**Branch/PR:** [`feat/plan-change-financial-validation` / #42](https://github.com/hydedfeg/TGReposter/pull/42).

- Added arithmetic-safe owner-scoped upgrade/downgrade comparison with integer EUR cents and remaining-term fraction.
- Example: Creator €15→Professional €39 with exactly half a term remaining gives an illustrative **€12** additional value.
- Read-only `GET /api/billing/subscription/change-preview?targetPlanId=...` responds with `checkoutEnabled:false` and `policyStatus:requires_approval`. Downgrade is modeled at end of term with no automatic refund.
- Added injectable transaction clients for isolated tests of **real fulfillment functions** in synthetic PostgreSQL-compatible PGlite, covering payment→subscription→included AI grant and paid top-up/retry.
- No actual upgrade, downgrade, tax calculation or payable checkout quote is authorized by this preview.
- Documentation: `docs/PLAN_CHANGE_FINANCIAL_VALIDATION.md`.

### Phase 9 — Combined crypto/commercial staging integration

**Branch/PR:** [`feat/commercial-staging-integration` / #43](https://github.com/hydedfeg/TGReposter/pull/43).

- Created merge integration preserving **both** latest crypto-payment scanner/alerts infrastructure and commercial Phase 1–8 stack; resolved overlapping Billing & Usage versus Payment Operations navigation.
- Fixed integration TypeScript failures (duplicate icon import and provider-error union narrowing).
- GitHub CI completed lint, test and build; Railway **staging only** deployed combined code while commercial enablement flags remained absent.
- Applied seven commercial migrations to Supabase **staging only**, aligned source filenames with versions recorded by Supabase, checked browser role restrictions, RLS and no auto-enrollment.
- At Phase 9 verification: six plans/four packs seeded but unpublished; zero commercial subscriptions, quotes/orders, AI usage or credit events.
- The production Railway application remained on `main`; production Supabase had none of the commercial tables.
- Documentation: `docs/PHASE_9_COMMERCIAL_STAGING_VALIDATION.md`.

### Phase 10 — Financial acceptance tests, simulated identities + real staging schema

**Branch/PR:** [`feat/billing-financial-acceptance-tests` / #44](https://github.com/hydedfeg/TGReposter/pull/44).

- Two simulated authenticated account sessions via real Express billing router and PGlite-loaded production-shaped commercial migrations: verifies separate plans, source/destination/campaign counts, included/purchased balance isolation, 401s, private headers, owner override rejection.
- Synthetic payment validation against actual subscription fulfillment: wrong token/recipient, zero confirmations, incorrect amount or mismatched owner **cannot** issue a term. A valid synthetic transfer can activate once and a replay is idempotent.
- Real **staging** PostgreSQL smoke test `tests/sql/phase10_staging_billing_acceptance.sql` checked payment match, unique chain event and cross-owner invoice FK **inside a transaction ending in ROLLBACK**.
- Did **not** prove real Supabase sign-ins or actual two-session Postgres lock contention. Earlier lock probe was inconclusive.
- Documentation: `docs/PHASE_10_BILLING_FINANCIAL_ACCEPTANCE.md`.

### Phase 11 — Real PostgreSQL concurrency and safe live-Auth testing harness

**Branch/PR:** [`feat/live-staging-acceptance-harness` / #45](https://github.com/hydedfeg/TGReposter/pull/45).

- Added disposable PostgreSQL 16 GitHub Actions service, guarded to loopback/exact disposable DB name, loading real commercial migrations.
- Proved advisory lock contention on two different PostgreSQL backends using `pg_backend_pid()`.
- Concurrent real service calls verified one subscription fulfillment, one included grant, one purchased top-up credit; cross-owner fulfillment denied.
- Added `scripts/verifyStagingBillingAuth.ts`, restricted to exact staging hostname. It **requires credentials for two existing, confirmed staging-only Supabase accounts** and verifies real login, invalid JWTs, distinct owners and read-only Billing API isolation.
- **The real-auth script was prepared, not run**; credentials were not supplied. No real USDT transfer in this phase.
- GitHub CI final run passed both lint/test/build and real PostgreSQL job.
- `npm ci` reported dependency advisories (5 moderate, 3 high, 1 critical at that point); dependency remediation still requires separate review.
- Documentation: `docs/PHASE_11_LIVE_STAGING_ACCEPTANCE.md`.

### Phase 12 workstream (not counted as completed commercial implementation)

After Phase 11, exploratory payment-adapter fixture/audit tooling was started on `feat/phase12-payment-audit-acceptance`, followed by a read-only review of payment backend and database. This is **not** evidence that Phase 12 CI or live payment acceptance was completed. Any future results must be documented separately when verified.

## 5. Customer/API integration status

| Surface | Exists in code | Active for customers? |
|---|---|---|
| `GET /api/billing/overview` | Yes; owner-scoped read-only | Available on deployed staging app, prelaunch data only |
| `GET /api/ai/openrouter/models` | Yes; authenticated read-only catalog | Model discovery does not itself charge AI Units |
| `POST /api/billing/subscription/cancellation` | Yes, server-gated | **No** |
| `GET /api/billing/subscription/change-preview` | Yes, server-gated | **No** |
| Commercial AI reserve→OpenRouter→settle orchestrator | Yes, internal service | **No**, not mounted on legacy live AI APIs |
| Server commercial FX quote / checkout invoice | Yes, internal service | **No**, no approved customer checkout route |
| Verified subscription/top-up fulfillment | Yes, backend functions | **No**, worker disabled |
| Paid renewal/expiry and included grant worker | Yes, backend scheduler | **No**, flags disabled |
| `/api/crypto-payments/*` infrastructure | Yes, super-admin-only | Staging operational infrastructure, **not** customer checkout |
| Frontend Billing & Usage dashboard | Yes, localized read-only | **Staging preview**, no purchase controls |
| Backend source/destination/team/campaign tier enforcement | Not broadly connected | **No** |
| Free plan low-priority crawler / downgrade resource pausing | Sales Plan requirement | **Not delivered here** |
| Public sales pricing checkout, invoices, refunds | Strategy/roadmap | **Not a launched end-to-end product** |

Never infer plan limits are currently enforced simply because a plan record or user-facing usage counter exists.

## 6. Feature flags and operational boundaries

Relevant server variables; **example values below describe enablement conditions, not values we set**:

| Gate | Responsibility |
|---|---|
| `CRYPTO_PAYMENTS_ENABLED` | Existing crypto scanner/runtime; configured independently |
| `TGREPOSTER_SUBSCRIPTION_CHECKOUT_ENABLED` | Trusted commercial quote/subscribe services and required worker gate |
| `TGREPOSTER_BILLING_WORKER_ENABLED` | Periodic commercial order and renewal worker |
| `TGREPOSTER_COMMERCIAL_TOPUPS_ENABLED` | Purchased AI Unit top-up fulfillment stage |
| `TGREPOSTER_COMMERCIAL_AI_ENABLED` | Included Unit allocation and provider-funded AI accounting |
| `TGREPOSTER_SUBSCRIPTION_MANAGEMENT_ENABLED` | End-of-term cancellation/expiry operations |
| `TGREPOSTER_PLAN_CHANGE_PREVIEW_ENABLED` | Read-only, non-binding plan change estimate |
| `TGREPOSTER_OPENROUTER_API_KEY` | Server-held OpenRouter cost-provider credential |

The staging Railway configuration inspection found **no `TGREPOSTER_*` commercial flags** configured. Existing crypto scanner settings such as network RPC/indexer, required confirmations, receiving address and admin alert options were separate `CRYPTO_*` variables; they are not reproduced in docs with any secret values.

Never use test-only service options such as `enabled:true` from untrusted HTTP input. Those injected dependencies exist exclusively for isolated testing and controlled internal callers.

## 7. Staging migration record — authoritative environment versions

**Connected staging Supabase project:** `msmfilgdwuoymjhgtrmy`.  
**Production Supabase project:** `biowrbnafkagaafonzws` (**no commercial migration applied**).

| Applied staging migration filename | Introduced feature |
|---|---|
| `20261012144506_create_commercial_foundation.sql` | Catalog, subscription snapshot, AI request and Unit ledger |
| `20261012144528_add_ai_usage_reconciliation.sql` | Provider generation ID and pending reconciliation state |
| `20261012144532_add_ai_topup_packs.sql` | Four unpublished AI product packs |
| `20261012144536_add_ai_topup_orders.sql` | Private AI top-up purchase orders |
| `20261012144539_subscription_checkout_foundation.sql` | Server FX quotes, subscription orders and paid terms |
| `20261012144544_billing_operation_retries.sql` | Worker failure/backoff ledger |
| `20261012144548_subscription_lifecycle_events.sql` | Subscription lifecycle audit and expiry stage |

These versions were generated when applying the migrations **after later crypto migrations already existed on staging**. They replace the original earlier-dated filenames on the **staging integration** branch, while older stacked PR branches may still contain the pre-staging filenames. **Do not blindly merge/apply both variants or attempt an arbitrary history rewrite.** Reconcile against target environment migration history before a future production release.

## 8. Verified security/reliability controls, and limits of that verification

### Observed safeguards

- Real backend session/owner identity derived from server auth rather than frontend-provided billing owner.
- Private DB commercial tables with RLS and revoked direct browser grants.
- Cross-owner composite foreign keys; unique event, quote, subscription and payment identifiers.
- Transactional per-owner credits and fulfillment; separate scanner global lock and billing worker global lock.
- Confirmed invoice **plus assigned, matching confirmed transfer** required for paid entitlement fulfillment.
- Unknown provider cost stays pending; no implicit free settlement.
- Safe customer billing response with `Cache-Control: private, no-store` and no raw wallets, provider keys or transaction hashes.
- Source monitoring/publishing remain usable while commercial charging is inactive.
- Staging migration/read/write smoke checks, isolated PGlite tests and GitHub CI disposable-real-Postgres race tests.

### What these checks **do not** prove

- They do not prove a completed **real customer checkout** or live USDT transfer across all three chains.
- The Phase 10 HTTP identities were simulated; Phase 11 real Supabase login harness has **not** been executed.
- Test Postgres race checks were conducted in a disposable CI container, not production worker/connection-pool conditions.
- No provider-funded OpenRouter production charge/usage reconciliation at scale was verified.
- No paid-plan tier enforcement, tenant/team seat enforcement, subscription taxes, refunds or disputed payments was launched.
- No financial margin, churn, revenue, conversion or user capacity benchmarks were established.

## 9. Unresolved launch blockers and recommended order

**P0 — Security and money safety:**
1. Review the reported dependency advisories and pin/remediate affected packages after assessing breaking changes.
2. Run authenticated staging test with two verified **real** Supabase user sessions and expiring/invalid tokens; confirm tenant isolation end to end.
3. Establish compliant merchant/USDT network/payment terms; VAT, tax invoice, payments/confirmation and refund/chargeback treatment.
4. Run an authorized, deliberately small **real** USDT test purchase through invoice issuance, chain watcher, verified order settlement, subscription activation and AI allowance posting; reconcile the transfer independently.
5. Create a financial exception/reconciliation process for paid-but-unlinked invoices, late/short/overpayments and missed renewals. A historical staging BSC paid invoice is unlinked to commercial orders and may be an infrastructure test; confirm purpose rather than granting benefits automatically.

**P1 — Product activation and enforceable economics:**
6. Design and expose safe authenticated customer quote/payment/purchase endpoints with explicit price, chain, expiry, tax and refund disclosures.
7. Wire commercial OpenRouter orchestration to chosen AI endpoints behind explicit plan entitlement and rollout gates, without breaking older personal-key users.
8. Implement/enforce source, destination, campaign and eventually organization-seat limits in backend; support downgrade-safe pausing and low-priority Free monitoring.
9. Approve mid-cycle upgrade proration, interval changes, annual allowance behavior and purchased Unit adjustment/refunds.
10. Add telemetry for per-tenant OpenRouter cost, FX fees, monitoring costs, activation, paid conversion and margins.

**P2 — Release hygiene:**
11. Merge/reconcile the parallel draft PR stack into a reviewed release branch, resolving migration filenames/history per target environment.
12. Repeat lint/tests/build, disposable concurrency, staging auth, checkout acceptance and SQL privilege review.
13. Apply production migrations and toggle catalog publication/flags only after an explicit commercial go/no-go decision with monitoring and rollback plan.

## 10. Documentation and source index

### Canonical plan and detailed engineering notes

- [Pricing & Sales Plan](./PRICING_AND_SALES_PLAN.md) — commercial policy and six-phase original roadmap.
- [Commercial data foundation](./COMMERCIAL_FOUNDATION_IMPLEMENTATION.md) — implementation Phase 1.
- [OpenRouter commercial metering](./OPENROUTER_COMMERCIAL_METERING.md) — Phase 2.
- [AI allowances and verified top-ups](./AI_ALLOWANCE_AND_TOPUP_FULFILLMENT.md) — Phase 3.
- [Subscription checkout foundation](./SUBSCRIPTION_CHECKOUT_FOUNDATION.md) — Phase 4.
- [Billing operations worker](./BILLING_OPERATIONS_WORKER.md) — Phase 5.
- [Customer Billing & Usage dashboard](./CUSTOMER_BILLING_DASHBOARD.md) — Phase 6.
- [Subscription lifecycle safety](./SUBSCRIPTION_LIFECYCLE_SAFETY.md) — Phase 7.
- [Plan-change financial validation](./PLAN_CHANGE_FINANCIAL_VALIDATION.md) — Phase 8.
- [Phase 9 staging integration](./PHASE_9_COMMERCIAL_STAGING_VALIDATION.md).
- [Phase 10 financial acceptance](./PHASE_10_BILLING_FINANCIAL_ACCEPTANCE.md).
- [Phase 11 PostgreSQL/staging-auth harness](./PHASE_11_LIVE_STAGING_ACCEPTANCE.md).
- [Crypto-payment architecture](./CRYPTO_PAYMENTS.md) — prerequisite infrastructure.
- [Chronological code and migration changelog](./SALES_PLAN_IMPLEMENTATION_CHANGELOG.md).

### Primary code ownership map

| Code area | Main responsibility |
|---|---|
| `server/billing/planCatalog.ts` | Effective plan selection |
| `server/ai/openRouterModelCatalog.ts` | Model discovery and compatible pricing |
| `server/billing/aiUnits.ts`, `aiBalanceService.ts` | Exact cost accounting, reserves and settlement |
| `server/billing/openRouterReconciliation.ts` | Pending provider generation-cost lookup |
| `server/billing/monthlyAIAllowance.ts` | Monthly/annual-window grants |
| `server/billing/aiTopupService.ts` | Invoice-backed top-up prep and fulfillment |
| `server/billing/checkoutQuoteService.ts` | EUR/USDT price snapshots and FX validation |
| `server/billing/subscriptionInvoiceCheckout.ts` | Quote-to-invoice composition |
| `server/billing/subscriptionCheckoutService.ts` | Paid term/renewal fulfillment |
| `server/billing/billingOperationsWorker.ts`, `billingOperationsScheduler.ts` | Retryable financial worker |
| `server/billing/subscriptionLifecycleService.ts` | Cancellation/reversal/expiry |
| `server/billing/planChangePreview.ts` | Non-binding plan-change illustration |
| `server/billing/billingOverviewService.ts` | Safe owner-filtered usage/plan projections |
| `server/routes/billingOverview.ts`, `src/components/BillingOverview.tsx` | Authenticated API and display |
| `server/payments/*`, `server/repositories/cryptoPaymentRepository.ts` | Independent on-chain invoice/scan/event layer |
| `tests/billingConcurrentPg.pg-check.ts` | Real disposable-Postgres concurrency acceptance |
| `scripts/verifyStagingBillingAuth.ts` | Real staging auth acceptance script (**not yet run**) |

### GitHub review references

PR [#35](https://github.com/hydedfeg/TGReposter/pull/35), [#36](https://github.com/hydedfeg/TGReposter/pull/36), [#37](https://github.com/hydedfeg/TGReposter/pull/37), [#38](https://github.com/hydedfeg/TGReposter/pull/38), [#39](https://github.com/hydedfeg/TGReposter/pull/39), [#40](https://github.com/hydedfeg/TGReposter/pull/40), [#41](https://github.com/hydedfeg/TGReposter/pull/41), [#42](https://github.com/hydedfeg/TGReposter/pull/42), [#43](https://github.com/hydedfeg/TGReposter/pull/43), [#44](https://github.com/hydedfeg/TGReposter/pull/44), and [#45](https://github.com/hydedfeg/TGReposter/pull/45) were all verified **open and draft** when this document was prepared.

---

**Conclusion:** The Sales Plan has a substantial backend/data/UX implementation and a deployed **staging** integration. Its price catalog, allowance design, paid-term logic, crypto watcher integration and automated accounting safeguards are real code. Customer checkout, charging, paid-plan enforcement, taxes/refunds and final acceptance remain **prelaunch**. Treat the implemented system as a financial-product foundation, not as a live subscription business.
