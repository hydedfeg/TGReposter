# Subscription Lifecycle Safety — Phase 7

**Branch:** `feat/subscription-lifecycle-safety`  
**Target:** `feat/customer-billing-dashboard` (stacked draft PR)  
**Status:** Implementation on a feature branch, NOT launched.

## Delivered

### End-of-term cancellation / reversal

`server/billing/subscriptionLifecycleService.ts` provides the backend-only transactional
`setEndOfTermCancellation(ownerPrincipal, cancel)`.

The operation requires:

- a valid backend-derived tenant principal;
- an active, unexpired paid subscription;
- the explicit `TGREPOSTER_SUBSCRIPTION_MANAGEMENT_ENABLED=true` launch gate;
- no future scheduled *already paid* term and no unsettled subscription order
  attached to a non-expired/non-canceled invoice.

Cancellation records `billing_subscriptions.cancel_at_period_end=true`, but
**does not terminate already paid access early**, revoke API keys, charge
anything, or issue refunds. Restoring the state (setting the flag false)
is permitted before the paid term ends under the same safety rules.

The operation uses the per-owner PostgreSQL advisory transaction lock already
shared with the commercial fulfillment/AI ledger services. Duplicate requests
with the same state are idempotent and produce no duplicate audit entry.

The private, append-only-intent `billing_subscription_events` table records
`cancel_scheduled`, `cancel_reversed`, and `expired`. Its composite
`(owner_principal,subscription_id)` FK prevents referencing another
customer's subscription; direct browser reads/writes are denied.

No automatic recurring USDT charge is currently implemented. Thus,
`cancel_at_period_end` means **"finish at the current paid term"**, NOT a
claim that a wallet or a payment processor has been instructed to stop
future automatic charges.

### Subscription expiry reconciliation

`expireEndedSubscription(ownerPrincipal)` checks the DB clock and, after
a paid period has ended:

1. closes the historical active term as `completed`;
2. marks the current snapshot `expired`, maintaining accurate customer
   status alongside the existing fail-closed effective-plan resolver;
3. writes an owner-scoped `expired` lifecycle event atomically.

**Critical:** If an already paid scheduled renewal is currently due, the
expiry function returns without changing access, so the renewal worker can
activate it first. If a prepaid renewal's entire term has already elapsed
without activation, it fails with `MISSED_PAID_RENEWAL` and requires manual
financial investigation; the system cannot silently forfeit that purchase.

The billing operations worker now runs:

```text
subscriptions → topups → due renewals → expired paid periods → AI grants
```

Expiry is a separately gated stage. Retry storage now supports
`expirations` and retains the existing fairness/backoff behavior.

### Authenticated management route

`POST /api/billing/subscription/cancellation`

```json
{"cancelAtPeriodEnd": true}
```

- Bearer authentication uses the existing Supabase/legacy server middleware.
- The owner is **only** derived from `req.user`. A client-supplied owner is
  rejected, not trusted.
- Denies the request with HTTP 503 unless the management launch flag is
  enabled.
- Invalid fields: HTTP 400. Prepaid renewal/unsettled order: HTTP 409.
- Successful response includes only cancellation flag, effective date and
  whether a transition actually occurred.
- Response is private and non-cacheable.

No cancellation UI button has been added. An authenticated user action with
clear consequences and explicit confirmation must be designed and tested before
revealing a live cancellation control.

### Financially safe plan-change boundary

Mid-term paid upgrades, paid downgrades and billing-interval changes remain
**blocked by the existing checkout services** until server-side proration,
refund handling, taxes and payment confirmation are formally designed and
tested. This phase deliberately does not turn a downgrade request into an
unpaid paid-plan entitlement, and does not create an automatic charge.

## Verification

Added tests:

- `subscriptionLifecycleService.test.ts`: idempotent cancel/reverse,
  owner locking, paid-term preservation, pending/prepaid order conflicts,
  safe expiry, due/missed renewal handling, and disabled-by-default flag.
- `subscriptionLifecycleRoute.test.ts`: 401 without session, default 503,
  rejection of cross-user spoofing, HTTP 409 on financial conflicts.
- `subscriptionLifecycleMigration.test.ts`: owner-scoped audit FK, denied
  browser permissions, expiry retry-stage constraint.
- Updated billing worker/scheduler tests for the new expiry stage.

Combined Phase 1–7 SQL was run on **TGReposter Staging Supabase**
inside one explicit transaction:

- seven commercial migrations applied in sequence in the transaction;
- expiry worker candidate query successfully PREPARE/EXPLAIN compiled;
- cross-owner event references rejected;
- owner audit transitions and expiry retry stage inserted in the transaction;
- browser-role privileges checked;
- the transaction ended with **ROLLBACK**.

No staging or production schema was changed.

Vercel preview / test build and `npm run lint` still require final verification
before merging. Do not interpret an infrastructure `git_info_fail` preview
error as a code/build failure or as a successful test.

## Remaining Phase 7 / launch work

- Test the complete TypeScript service path against an isolated PostgreSQL
  database with seeded, signed-off plan/quote/invoice/chain-event fixtures.
- Decide and implement the billing/refund treatment of prepaid scheduled
  renewals whose customer requests cancellation.
- Approve exact mid-cycle upgrade proration and paid-downgrade policies;
  implement customer price preview before making purchases possible.
- Design explicit customer cancellation confirmation/undo UI.
- Add operator tooling for disputed payments, missed paid renewals, expiring
  quotes, chargeback/refund requests, and unresolved OpenRouter generations.
- Verify payment provider/USDT jurisdiction, tax/VAT and billing invoice
  requirements.
- Review and merge the stacked PRs in order, then apply migrations to staging
  before running real authenticated service-level tests.
- Do not enable billing worker, commercial AI, checkout, top-ups, management,
  or plan limit enforcement in production until these are complete.

**Safety:** None of the feature flags were enabled, no charges were created,
and no existing tenant was enrolled, downgraded or restricted in this phase.
