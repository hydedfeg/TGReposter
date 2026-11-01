# Customer checkout abuse controls and policy release gates

## Technical guardrails (staging development)

Authenticated checkout mutation endpoints for **both** subscriptions and AI
top-ups share an atomic PostgreSQL owner budget:
- Quotes: at most 6 per minute and 30 per hour.
- New invoices: at most 3 per minute and 12 per hour.
- Budgets are backend-owned, tenant-scoped and enforced across Railway
  processes/replicas using a row-level UPSERT. The database clock is used,
  never a forwarded IP address or request-supplied owner.
- A rejected request returns HTTP 429 `CHECKOUT_RATE_LIMITED` and
  a bounded standard `Retry-After` header; no quote or invoice is created.
- Invalid input and disabled checkout are rejected before checking budgets.
- Postgres failures fail closed with HTTP 503 rather than silently disabling
  throttling. Read-only order status and prelaunch pricing remain available.
- The table is service-role only with RLS and no direct customer access.

The quotas are conservative prelaunch safety defaults. Concurrency tests,
active invoice caps, distributed global/IP-abuse protection (with a trustworthy
reverse-proxy configuration), request-size constraints, and periodic cleanup
remain separate launch tasks. A per-owner limit alone is **not** a substitute
for coordinated abuse defense.

## Merchant decisions required before accepting real USDT

These are outstanding **decisions**, not existing policies. Legal and payment
operations review must approve and publish:
- Merchant legal identity and contracting jurisdiction, support contact,
  applicable tax/VAT treatment and invoice/receipt requirements.
- Accepted blockchains, canonical USDT token contract identities, exact
  amount policy, network fees, confirmation/finality thresholds and quote expiry.
- Underpaid, overpaid, duplicate, expired and wrong-network transactions:
  reconciliation workflow, review SLA and account verification before disposition.
- Refund eligibility, method, fees, identity/wallet verification, timing,
  and how blockchain finality affects refund handling.
- Subscription renewal, cancellation, prorations, suspension, dispute handling
  and users' statutory consumer rights wherever applicable.
- Privacy and log retention for financial records, data minimization and
  merchant risk/sanctions screening responsibilities.

No user-facing payment/refund promises should be fabricated. Until those
policies are approved and checkout launch flags are explicitly enabled,
the checkout remains **non-payable** on staging, and production is unchanged.

## Acceptance

PGlite migration/SQL and API tests verify owner isolation, consistent
subscription/top-up throttling, multi-window caps, retries, RLS denial,
disabled-checkout behavior and no invoice creation on a 429.

This change does not enable merchant wallets, live transfers, published paid
plans, commercial AI charging, production rollout or Telegram alerts.
