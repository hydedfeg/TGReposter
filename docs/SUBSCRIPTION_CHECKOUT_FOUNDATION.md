# Subscription Checkout Foundation — Phase 4

**Branch:** `feat/subscription-checkout-foundation`  
**Target:** `feat/ai-monthly-credits` (stacked draft PR)  
**Status:** Backend foundation only — billing disabled, no customer checkout route.

## Implemented

1. **Server-owned, short-lived EUR→USDT pricing quotes.**
   - Quote gets EUR list price from published `billing_plans` or published `billing_ai_topup_packs`.
   - Kraken public USDTEUR ticker provides **USDT/EUR ask price**, with matching bid spread sanity-check.
   - A conservative 1.5% conversion buffer is included; this is not VAT or a payment fee.
   - All amounts use integer/decimal arithmetic with six-decimal USDT rounding upward.
   - Zero/malformed/ambiguous/stale/illiquid quotes fail closed.
   - Quote records are owner-scoped, server-issued, immutable in normal workflows and expire after five minutes.
   - A quote is a **price estimate and locked checkout amount**, not a payment guarantee or an exchange execution.
   - Kraken is an indicative rate source. The quote provider, slippage, asset valuation and tax treatment require commercial review before launch.

2. **Backend-only invoice and order creation.**
   - Internal `createSubscriptionCheckoutInvoice` reads the quote and requests a USDT invoice from the existing `CryptoPaymentInvoiceService`, using an owner/quote-specific idempotency key.
   - Invoice amount comes from the server quote, NEVER from the browser.
   - `prepareSubscriptionOrder` verifies quote ownership, expiry, invoice ownership, pending state, listed amount and single-use invoice requirements.
   - A single invoice cannot be used both for a subscription and an AI top-up through these services.
   - AI top-up orders now validate the real stored quote ID, pack, owner, EUR amount, USDT amount and expiry, rather than accepting an arbitrary quote-reference string.

3. **Verified subscription fulfillment.**
   - Requires an existing prepared order.
   - The invoice must be paid and confirmed.
   - A matching confirmed chain transfer must have the correct network, token, receiving address and *expected payment amount*, not merely a transaction hash submitted by the user.
   - `fulfillVerifiedSubscription` creates a historical entitlement term and updates the current subscription snapshot **in one PostgreSQL transaction**.
   - Duplicate fulfillment is idempotent.
   - Each owner may have at most one active term and one scheduled renewal.
   - A first paid term activates immediately; an early payment for a renewal creates a **future scheduled term**, preserving existing active access.
   - `activateDueSubscriptionTerm` can promote the scheduled term at the proper boundary; it is not attached to a live scheduler or customer API yet.
   - Mid-period plan changes or billing-interval changes are **rejected** until a reviewed proration/refund/credit policy is implemented. This avoids a paid plan-change invoice that cannot be fulfilled safely.

4. **Isolation and control.**
   - Three new commercial tables: `billing_fx_quotes`, `billing_subscription_orders`, `billing_subscription_terms`.
   - Browser roles cannot read or write the new tables directly.
   - Owner-scoped foreign keys prevent attaching another person's quote or invoice.
   - All services require `TGREPOSTER_SUBSCRIPTION_CHECKOUT_ENABLED=true`, which is intentionally unset.
   - No plan or AI top-up pack is published and no user was charged or enrolled.

## Important constraints before launch

- EUR plan prices are *not* automatically tax-inclusive: implement and approve applicable VAT/tax treatment and invoice documents before activating checkout.
- Verify Kraken USDTEUR market availability, pricing spread, buy/sell rate selection, precision, conversion risk and custody/payment regulations.
- Create authenticated, rate-limited customer checkout APIs with backend-derived identity, CSRF/CORS safeguards and a clear payment preview/consent step.
- Implement a durable payment-fulfillment scheduler; no payment/status watcher is yet wired to subscription or AI Unit commercial orders.
- Link subscription activation with idempotent monthly AI Unit grants, including new signup, renewal and Free plan.
- Implement proration and explicit treatment of planned upgrades, downgrades, refunds and chargebacks.
- Define subscription renewal anchor policy for month-end dates; chained calendar-month clamping can shift billing anniversaries.
- Handle an abandoned or expired quote after an invoice is issued; orphaned pending invoices must not confer entitlements.
- Add PostgreSQL integration tests around concurrent payments, renewal promotions and duplicate callback retries.
- Verify user flows and finance/ledger reconciliation before enabling any production flags.

## Validation

- The combined commercial migrations (Phases 1–4) were executed in a PostgreSQL transaction on the connected staging Supabase project.
- Checks included: unpublished plans, unpublished AI packs, no browser access to private billing tables, cross-account quote FK rejection, duplicate-invoice refusal, and no automatic subscription when an order or term is inserted.
- The transaction was **rolled back**, leaving staging unchanged.
- `tests/subscriptionCheckoutQuote.test.ts` tests market parsing, rates, spread bounds, decimal rounding and disabled checkout.
- `tests/subscriptionCheckoutMigration.test.ts` tests table security, owner constraints, invoice uniqueness and one scheduled renewal.
- Full test/build pipeline should be inspected on Vercel preview before merge.

## Planned next phase

1. Verify the stacked branches and merge foundational PRs in migration order.
2. Finish safe payment/quote checkout APIs, trusted tax treatment and payment instructions.
3. Complete subscription renewal scheduler and AI allowance orchestration.
4. Implement mid-cycle upgrade/downgrade pricing and credit adjustments.
5. Add customer billing UI and plan-usage dashboards.
6. Run staged real payment tests before any production enablement.
