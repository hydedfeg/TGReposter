> **Historical acceptance evidence — archived October 25, 2026.** This document records Phase 10 results as originally reported on October 12, 2026. Some earlier blockers were subsequently addressed by PRs #54, #72, #73 and later staging tests. This is not the current launch-readiness verdict; see `docs/STAGING_MIGRATION_LEDGER_RECONCILIATION.md`, `docs/STAGING_BACKOFF_MIGRATION_REHEARSAL.md` and PR #43. The original text below is preserved unchanged.

---

# Phase 10 — Billing Financial Acceptance Tests

**Date:** 2026-10-12  
**Status:** Acceptance harness implemented and green in CI; staged PostgreSQL smoke test passed; financial launch **not approved**.  
**Branch:** `feat/billing-financial-acceptance-tests`  
**Base:** `feat/commercial-staging-integration`  
**PR:** https://github.com/hydedfeg/TGReposter/pull/44

## 1. Test scope and boundaries

Phase 10 provides two deliberately separate levels of evidence.

**A. HTTP + real schema, isolated database:** The tests exercise real
`GET /api/billing/overview` routing and `getBillingOverview` SQL against
an ephemeral PGlite PostgreSQL-compatible database loaded from the seven
real commercial migrations. A test-only middleware assigns two simulated
Supabase-style session identities. No actual Supabase Auth login occurs.

**B. Staging PostgreSQL, rollback-only:** The SQL smoke test runs on the
existing staging Supabase schema using a dedicated `phase10` fixture.
Every fixture is created inside `BEGIN` and discarded with `ROLLBACK`.
No actual wallet or network is used.

Commercial flags remain OFF. No plan is published or account enrolled
in staging as part of this testing.

## 2. Identity / tenant isolation

`tests/billingFinancialAcceptance.test.ts` uses Alice and Bob under
different `supabase:<uuid>` principals and validates:

- HTTP 401 without a simulated verified session identity.
- A query-string `owner_principal` override is ignored.
- Creator/monthly plan for Alice and Professional/annual for Bob.
- Independent active source, destination, and campaign counts.
- Separate included and purchased AI Unit balances.
- No sensitive payment keys, wallet address, or owner override in payload.
- Live resource counts read from a database rather than mocked results.

**Limit:** The test middleware substitutes for the existing Auth layer.
Actual Supabase login, token validation/expiration, and two independent
staging browser sessions are **not** covered by this harness.

## 3. Payment authorization, evidence and idempotence

`tests/billingPaymentEvidenceAcceptance.test.ts` exercises the real
`fulfillVerifiedSubscription` function using an ephemeral PGlite database:

1. Invoice status is `paid`, but the only transfer has a wrong token or
   recipient → paid entitlement denied.
2. A transfer has zero confirmations → denied.
3. Transfer amount differs from the exact expected amount → denied.
4. Transfer belongs to a different owner principal → denied.
5. Correct confirmed, matching transfer → one active subscription term.
6. Replay of fulfilled order → `created:false`, no duplicate term.
7. Bob cannot fulfill Alice's order → rejected.

The existing Phase 8 tests cover paid subscription activation, monthly
allowance grant idempotency, top-up confirmation, and purchased AI Units.

**Limit:** The scenarios run sequentially, not as two simultaneous
PostgreSQL transactions. True multi-client race tests and actual live
blockchain confirmation are still blocking requirements.

## 4. Staging SQL evidence

`tests/sql/phase10_staging_billing_acceptance.sql` ran successfully on
Supabase staging project `msmfilgdwuoymjhgtrmy`:

- matched network, token, recipient, confirmed status, positive confirmations,
  and expected amount;
- refused a wrong token and a zero-confirmation transfer;
- accepted matching synthetic transfer evidence;
- enforced unique `(network,tx_hash,event_index)` chain-event identity;
- rejected a transaction referring to another owner's invoice through
  the owner-scoped composite foreign key;
- confirmed that mere evidence records do not activate a paid subscription.

The smoke script ends in `ROLLBACK`. Initial failure from an ambiguous
PL/pgSQL invoice variable was corrected and the smoke test then passed.

A follow-up advisory-lock probe issued two tool requests concurrently,
but the second acquired the lock. Because request/session overlap was
not established, **do not claim this validates lock contention or
serializability**. The current PostgreSQL behavior under two simultaneous
workers still requires a proper separate-connection test harness.

## 5. CI

- GitHub CI run `38267389519`: **success**, including TypeScript check
  and tests/build of the new HTTP and synthetic payment suites.
- GitHub CI run `38267667095`: **success**, after adding/fixing the
  staging smoke SQL fixture.
- Tests run with `tests/testEnvironment.ts` clearing Railway/Supabase
  environment credentials; no unit/integration tests connect to live
  customer data.

## 6. Controls and non-goals

- No changes to deployed Railway runtime or production database.
- No real payment invoice purchase, blockchain transfer, withdrawal or refund.
- No commercial flags enabled, no AI billing enabled.
- No checkout/plan upgrade path activated.
- Existing production `main` and the staging integration release branch
  remain unchanged by this PR.

## 7. Blocking acceptance cases before launch

1. Actual Supabase Auth sign-ins by two staging-only customer accounts,
   testing expiry/invalid JWT and Billing page isolation.
2. **Two independent PostgreSQL connections** executing conflicting owner
   transactions concurrently, including duplicate subscription payment,
   duplicate purchased credit, and allowance grants.
3. Controlled live USDT transfer using an expressly approved small test
   payment; verify chain watcher finality, replay, settlement and alerts.
4. End-to-end runtime operation of the billing worker with flags enabled
   **only in a disposable/isolated financial test environment**, not the
   shared staging service with active crypto scanning.
5. Operational handling of quote expiry, underpayment, overpayment,
   refunded/disputed transfers, missed paid renewal, annual allowance
   boundaries and OpenRouter generation reconciliation.
6. Financial policy sign-off: VAT, receipts, payment fees, rate spread,
   refund policy and paid-upgrade/downgrade proration.
7. Review the inherited draft PR stack and aligned migration history
   before any production merge.

**Verdict:** Database invariants and synthetic server acceptance scenarios
passed. Real identity, truly concurrent PostgreSQL transactions, actual
blockchain payments, and commercial launch remain unverified.
