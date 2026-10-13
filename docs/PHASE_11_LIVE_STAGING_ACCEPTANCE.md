# Phase 11 — Real PostgreSQL Concurrency and Staging Authentication Acceptance

**Date:** 2026-10-12  
**Status:** Real PostgreSQL concurrency tests implemented and CI-verified; staging Supabase Auth sign-ins **NOT executed**.  
**Branch:** `feat/live-staging-acceptance-harness`  
**Draft PR:** https://github.com/hydedfeg/TGReposter/pull/45  
**Parent:** `feat/billing-financial-acceptance-tests` (Phase 10).

## 1. Scope and precise trust boundaries

This phase closes the Phase 10 **fake-concurrency** gap using a real,
disposable PostgreSQL 16 container and two distinct database sessions.
It also supplies a separately executable acceptance script for actual
staging Supabase users; because their sign-in secrets are not available
in this development context, that second test is **prepared but not run**.

No production secrets, staging DB write credentials, wallet keys or
customer credentials were added to GitHub or the test code. The
commercial/billing gates stay disabled.

## 2. Actual PostgreSQL concurrency, CI

**Code:** `tests/billingConcurrentPg.pg-check.ts`  
**CI:** `.github/workflows/ci.yml`, `postgres-financial-concurrency` job.

The CI job provisions a fresh `postgres:16` service with a local-only
`tgreposter_billing_test` database. The test verifies its connection
URL refers to **loopback and that exact database name**, then runs the
actual seven commercial migrations against the disposable database.

The test exercises real service functions, not mocked fulfillment
logic:

1. Two distinct PostgreSQL backends (checked with
   `select pg_backend_pid()`) hold independent connections. When
   connection A takes a transaction advisory lock, connection B's
   non-blocking lock attempt must return `false`. After A commits,
   B must acquire the lock.
2. Two concurrently invoked confirmed-subscription fulfillments,
   using a fully matching **synthetic** invoice and transfer, produce
   exactly one active subscription term. One caller sees `created:true`
   and the other `created:false`.
3. Two simultaneous included AI Unit grant operations yield exactly
   one 100-unit `included/grant` ledger event.
4. Two simultaneous purchased AI top-up fulfillments yield exactly
   one 500-unit `purchased/grant` event.
5. An attempt to fulfill the order using another owner's principal
   is denied.

**No real blockchain transfer was made.** The postgres job contains
only disposable fixtures. This is a genuine PostgreSQL multi-session
race test, but it does not by itself validate simultaneous executions
inside the Railway/Supabase production topology.

### CI findings

First CI check: the PostgreSQL concurrency job passed. The standard
TypeScript step found a type-only error because the installed `pg`
`PoolClient` does not declare `processID`.

Fix: compare results of server-side `pg_backend_pid()` queries instead.
The subsequent CI run passed the concurrency and TypeScript jobs; confirm
the full test/build result in GitHub Actions before merging this PR.

GitHub's npm dependency install also reported **9 advisories**
(5 moderate, 3 high, 1 critical). This is a separate unresolved
security-review item. A dependency audit with production/dev impact,
affected package paths and patchability is needed before launch;
do not blindly run `npm audit fix` against billing code without review.

## 3. Genuine staging Supabase Auth validation

**Code:** `scripts/verifyStagingBillingAuth.ts`.

The script targets ONLY the checked Railway staging hostname:
`https://tgreposter-staging-production.up.railway.app`.
An attempt to target `api.tgreposter.com`, the production apex, or
another URL fails before any request.

The script **needs two pre-existing staging-only Supabase Auth accounts**
with separate, confirmed emails and credentials. It does not create
users, reset passwords, grant roles, create invoices or modify billing
state. Secrets come from the trusted process environment and are not
printed by the script.

To run in an authorized, trusted terminal, supply all five variables
through your environment / secret manager:

```text
TGREPOSTER_STAGING_BASE_URL
TGREPOSTER_STAGING_ALICE_EMAIL
TGREPOSTER_STAGING_ALICE_PASSWORD
TGREPOSTER_STAGING_BOB_EMAIL
TGREPOSTER_STAGING_BOB_PASSWORD
```

Then:

```sh
npx tsx scripts/verifyStagingBillingAuth.ts
```

The script verifies:

- Unauthenticated requests and a fabricated JWT are denied with 401.
- Both email/password logins succeed through the real backend and
  produce `authProvider=supabase` access tokens.
- The accounts have *different* server-derived `supabase:<uuid>` keys.
- Each bearer token can query `GET /api/billing/overview`.
- An attempt to change `owner_principal` through URL parameters cannot
  change whose account the backend reads.
- No-store cache headers and prelaunch Free status remain intact.
- Neither staging account has purchased AI Units, subscription orders
  or a paid entitlement.

**This is a prelaunch-only assertion.** If real paid subscriptions are
later authorized on staging, revise the expected plan/balance values
before rerunning.

**Current status: NOT EXECUTED.** The two real account credentials were
not available and were not requested or recreated. The Phase 10
simulated-session test is separate and must not be described as real
Supabase authentication.

## 4. Remaining launch blockers

- Run the above genuine Auth acceptance with two authorized staging-only
  accounts; verify login/session expiry and cross-tenant isolation in
  the real deployed backend.
- Repeat concurrency acceptance against a **separate, disposable**
  environment matching Supabase connection pooling behavior; don't
  run write-based racing tests on customer data.
- End-to-end real USDT test transfer, chain watcher ingestion,
  confirmation/replay and exact-match paid entitlement processing.
- Staging worker operation with reviewed launch switches under
  controlled financial-test conditions.
- Billing/tax/VAT/proration/refund/chargeback policy approval.
- Dependency advisories and credential/role security review.
- Stacked PR migration-history reconciliation before production merge.

**No commercial flags were enabled and no production data was changed.**
Keep this PR as draft and do not deploy it directly to production.
