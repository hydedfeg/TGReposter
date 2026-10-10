# Billing Operations Worker — Phase 5

Status: **Inactive feature branch. Do not activate payments yet.**
Branch: `feat/billing-operations-worker`
Base: `feat/subscription-checkout-foundation`

## Purpose and operations

An internal Railway worker connects verified payment records to commercial fulfillment. It does not scan blockchains or authorize a payment on its own. The existing crypto watcher handles network observations; the individual fulfillment services always revalidate confirmed transfers.

The worker processes these stages in order:

1. Fulfill confirmed, pending subscription orders.
2. Fulfill confirmed AI top-up orders.
3. Activate paid renewal terms when their start date arrives.
4. Allocate included monthly AI Units for active paid subscriptions.

Each action is transactional and owner-scoped. An early-paid renewal becomes scheduled and does not overwrite the current paid period. The scheduler has a global PostgreSQL advisory session lock to prevent simultaneous processing by multiple Railway instances. Each fulfillment also has a per-owner transactional lock.

## Configuration

All features are disabled by default and require backend environment flags. **No flags are enabled by this PR.**

```text
TGREPOSTER_BILLING_WORKER_ENABLED=true
TGREPOSTER_SUBSCRIPTION_CHECKOUT_ENABLED=true
TGREPOSTER_COMMERCIAL_TOPUPS_ENABLED=true
TGREPOSTER_COMMERCIAL_AI_ENABLED=true
```

The first two gates are required to start the worker. Top-up and allowance stages additionally require their respective flags.

Optional settings are `TGREPOSTER_BILLING_WORKER_INTERVAL_MS` (default 60000; allowed 30000–86400000) and `TGREPOSTER_BILLING_BATCH_SIZE` (default 25; allowed 1–50).

## Reliability and isolation

The migration adds `billing_operation_attempts`, a private RLS-protected retry table. Failed items remain pending in their original order table. Retries have increasing delays of approximately 2, 4, 8, 16, 32, and finally 60 minutes, so one problematic order does not prevent other customers from being served. Each stage handles individual item failures independently.

The scheduler logs only aggregate counts and sanitized error codes. It does not log owner identities, tokens or wallets. All billing orders, subscriptions and credit grants remain inaccessible to the browser directly.

Included AI is allocated only for active, published paid plans, using the existing monthly ledger service. This job does not allocate for every Free user: those credits should be granted lazily upon a verified AI action when the commercial product launches.

## Verification

- Added tests for stage order, feature flags, independent failures, retry filtering, timer lifecycles and protection against duplicate concurrent scheduler runs.
- Added a PostgreSQL retry-table regression test.
- Executed the combined commercial migrations in one transaction on Staging Supabase.
- Checked private roles, unpublished products, pending-order candidate discovery, retry delay filtering and lack of automatic paid enrollment.
- Rolled back the transaction; staging and production databases were left unchanged.
- Vercel CI/build still requires a final check before merge.

## Blocking work before launch

Complete stacked PR review and merging, staging service integration tests with confirmed payments, tax/VAT and quote compliance review, subscription proration and cancellation policies, refund/chargeback handling, scheduling visibility/alerts, authenticated billing UI and safe purchase/consent APIs. A paid invoice alone is not equivalent to entitlement activation.

**No live billing is enabled by this development phase.**
