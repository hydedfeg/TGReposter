# Phase 9 — Commercial Staging Integration and Verification

**Date:** 2026-10-12  
**Environment:** TGReposter **Staging** only  
**Integration branch:** `feat/commercial-staging-integration`  
**Pull request:** https://github.com/hydedfeg/TGReposter/pull/43  
**Commercial prerequisites:** Phases 1–8, draft PRs #35–#42  
**Status:** Staging code + private commercial SQL foundation deployed; billing **NOT launched**.

## 1. Integration strategy

The live staging backend's `feat/crypto-payment-infrastructure` had moved
ahead of the original commercial feature-base branch. Deploying the commercial
branch directly would have regressed newer crypto watcher protections, the
operational alert journal, the payment overview UI, and the opt-in
notification test infrastructure.

A dedicated two-parent Git merge commit
(`40fbf3e9abb1548c587df41690ffab080cfecafc`) reconciled:

- Phase 8 commercial billing branch (`d3dbc5ce8f6b43dd263d4d1f602cbc667594204c`);
- latest crypto payment branch at merge time
  (`ac9848e86bcc379bf2a1014651d3265fb91d6e1c`).

Six common UI files were merged so **Billing & Usage** remains available to
authenticated users and **Payment Operations** remains super-admin-only.
Payment runtime, watchers, repository, network logs and tests are preserved
from the newer crypto branch.

## 2. CI verification

- GitHub Actions CI run `38264392951` initially failed TypeScript checks:
  one duplicate `CreditCard` import and an unsafe union-property access
  in the dormant commercial OpenRouter service.
- Fixed both without changing production payment behavior.
- GitHub Actions run **38264586927**: **PASS**
  (`npm ci`, `npm run lint`, and `npm run build` including `npm test`).
- After aligning migration filenames and integration test references,
  GitHub Actions run **38265540111**: **PASS**.

The full OpenRouter commercial charge path remains **unmounted**, and
test-only transaction-client injections remain unavailable to HTTP callers.

## 3. Railway staging application

**Project:** TGReposter Staging (`67f1d854-e38d-42e1-8153-e3f75b0c9bd7`)  
**Service:** TGReposter Staging  
**Environment:** project-local environment named `production`
(which is NOT the real TGReposter production project).

Staging deploy `930c25a9-d341-4cf2-aa29-0d328798400c` succeeded with
the tested source commit **`09b6a97e8fe31f67abd133d87f4ad39819fe647d`**.
The service source is pinned to that exact commit to prevent later,
unreviewed integration-branch pushes from automatically deploying.

At verification the single staging replica was online. The service startup
reported the matching staging Supabase URL, and crypto payment preflight
passed for BSC, Ethereum, and TON. The crypto scheduler remains separate
from the dormant commercial billing worker.

**No `TGREPOSTER_*` commercial enablement variables were configured**
on the Railway staging service. In particular, subscription checkout,
top-ups, AI commercial charging, plan-change preview, subscription
management and the billing worker remain disabled.

## 4. Supabase staging schema

**Staging project:** `msmfilgdwuoymjhgtrmy` — **NOT production**.

The seven new commercial migrations were applied to staging in dependency
order using Supabase's migration tool. Because staging had later crypto
migration history entries already applied, Supabase generated the
following versions. Files on the integration branch were renamed **without
changing SQL content** to match the actual recorded staging history:

| Applied version | Migration |
|---|---|
| 20261012144506 | create_commercial_foundation |
| 20261012144528 | add_ai_usage_reconciliation |
| 20261012144532 | add_ai_topup_packs |
| 20261012144536 | add_ai_topup_orders |
| 20261012144539 | subscription_checkout_foundation |
| 20261012144544 | billing_operation_retries |
| 20261012144548 | subscription_lifecycle_events |

All **13 newly introduced commercial tables** were checked:
`relrowsecurity=true`, and roles `anon` and `authenticated`
have neither direct read nor direct write permissions.

Verified commercial data state:

| Check | Staging result |
|---|---:|
| Pricing plans seeded | 6 |
| Published plans | **0** |
| AI top-up packs seeded | 4 |
| Published packs | **0** |
| Enrolled subscriptions | **0** |
| Subscription/top-up orders | **0** |
| AI usage events | **0** |
| AI ledger entries | **0** |
| Subscription lifecycle events | **0** |

A rollback-only PostgreSQL synthetic test verified:

- cross-owner subscription audit-event FK rejection;
- unique AI credit ledger event keys;
- tenant-specific ledger write scoping.

The transaction ended in `ROLLBACK`, leaving test fixtures absent.

### Schema-history caution

Other stacked draft PRs **still reference the pre-staging versions** of
these migration filenames. Do not independently merge or apply those
same SQL files into this staging lineage. Align the chosen production
release branch's migration history and application strategy before
merging the stacked PRs into `main`. Verify migration lists and run a
dry-run before every database push. Never "fix" drift by blindly rerunning
`CREATE TABLE` or manually rewriting Supabase migration history.

## 5. Production protection

**Real production Railway** continues to deploy from `main`, and its
last checked deployment was successful.

**Real production Supabase** (`biowrbnafkagaafonzws`) had **zero**
commercial foundation tables at the verification point.

No production schema, variables, plans, AI credits, invoices,
entitlements or publishing workflows were modified by this phase.

## 6. Tests and limits not yet covered

Staging code and schema are deployed, but a full **authenticated and
end-to-end commercial financial acceptance test is not complete**.

Outstanding before financial launch:

1. Exercise staging Billing & Usage through two actual authenticated
   test-user sessions, checking responses, 401s and cross-user isolation.
2. Test a controlled, real test-size USDT transfer through the existing
   watcher only after an approved payment-testing process. No transfer has
   been initiated by this phase.
3. Verify retries, concurrent confirmation notifications, amount matching,
   subscription term transitions and monthly AI grants against staging
   with safe, explicitly identified test accounts.
4. Approve tax/VAT, crypto conversion and checkout disclosure policy.
5. Resolve upgrades, downgrades, refunds and annual allowance changes.
6. Integrate exact commercial entitlement checks with the existing
   end-user AI route behind reviewed feature switches.
7. Implement operational reconciliation and alerting, including pending
   OpenRouter generations and disputed/expired payments.
8. Reconcile all parallel PRs into one production migration plan. Run
   staging audit and full CI again before any production merge.
9. Enable the commercial billing flags only after a separately reviewed
   launch decision.

**Billing stays disabled. Existing TGReposter users remain unaffected.**
