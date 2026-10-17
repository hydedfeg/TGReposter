# Customer Billing & Usage Dashboard — Phase 6

**Status:** Preview feature, read-only. No paid checkout, commercial limit enforcement or AI balance deduction is enabled by this work.

**Branch:** `feat/customer-billing-dashboard`  
**Base:** `feat/billing-operations-worker`  
**Source of commercial decisions:** [PRICING_AND_SALES_PLAN.md](./PRICING_AND_SALES_PLAN.md)

## Delivered

### API: `GET /api/billing/overview`

Mounted under the existing backend's auth middleware and further refuses a request with no authenticated user. The backend derives `owner_principal` via `ownerPrincipalForUser(req.user)`. No owner/account identifier supplied in query strings, headers, or request bodies can alter the billing scope.

All private reads require `owner_principal=$1` and use normalized PostgreSQL tables:

- `billing_subscriptions`: current subscription status, billing interval and period dates.
- `billing_plans` and `billing_plan_features`: effective plan allowances and currently available features.
- `source_channels`: enabled source count.
- `destination_targets`: enabled destination count.
- `promotion_campaigns`: active (`ready` / `running`) campaign count.
- `ai_unit_ledger`: current-period included, purchased and granted AI Units.
- `billing_subscription_orders` and `billing_ai_topup_orders`: most recent 12 commercial orders and payment statuses.

The endpoint only returns safe, minimal display data. It never returns provider credentials, wallet/receiving addresses, transaction hashes, JWT data, raw usage prompts, external payment customer identifiers or unrelated invoice records. Response headers include `Cache-Control: private, no-store` and `Vary: Authorization`.

A missing commercial schema or database configuration returns HTTP 503 with `BILLING_NOT_READY`; other database errors return `BILLING_UNAVAILABLE`. **Neither condition fabricates a zero AI balance or a paid subscription.**

The effective plan resolver falls back to Free for expired, canceled, unknown or inactive subscription records. The raw subscription status is displayed separately for context. Plan catalog and feature availability remain server-authored.

### Frontend

`BillingOverview.tsx` displays:

- current/effective plan and proposed monthly list price;
- subscription interval, period end and cancellation-at-period-end state;
- included vs purchased AI Units and included grant-cycle reset date;
- active source, destination and campaign use against plan allowances;
- last 12 subscription and top-up orders with payment and fulfillment status;
- refresh and explicit loading, error and billing-not-ready states.

The page appears under **Personal setup**, accessible to every authenticated workspace user on desktop and in the mobile More menu. It re-fetches on each mount/refresh, sends the bearer token through the existing authenticated client convention, and aborts any in-flight request upon unmount or account switch. No customer financial data is written to localStorage.

Labels are available in all four supported locales: English, Persian, Russian and Arabic.

### Important product constraints

- Billing is still **not launched**. Plans and AI packs remain unpublished until the later launch workflow. When a catalog is installed but the effective plan is unpublished, the UI labels the data a **pre-launch preview**, not actual enforced limits.
- On existing production and staging, commercial tables are absent. The page shows a **Billing is being prepared** state instead of misleading dummy numbers.
- The Users / team seat counter is intentionally **not reported**: the current per-user/tenant design does not provide an authoritative shared organization seat meter. A future organization and teams billing model must define and implement one before showing seat counts.
- The page contains **no inert Buy, Upgrade, Cancel, or Download invoice** actions. Those will be added only with genuine verified backend workflows.
- This endpoint is informational only: it cannot issue credits, create orders, create invoices, or change subscription state.

## Verification

Automated tests:

- `tests/billingOverviewService.test.ts`: owner-scoped SQL parameters, calculation/projection, expired plan fallback, missing schema and limited order list.
- `tests/billingOverviewRoute.test.ts`: owner-spoofing query ignored, 401 without a verified session, no-store headers, and 503 when commercial storage is unavailable.

Staging PostgreSQL transactional check:

- Evaluated all Phase 1–5 commercial migrations in an explicit transaction.
- PREPARE + EXPLAIN compiled all six read-only overview queries against staging's actual source/destination/campaign schema.
- Verified private commercial table privileges and catalog seed counts.
- Executed `ROLLBACK`; neither production nor staging schemas were changed.

The Vercel preview's full test/build results should be checked before this PR is marked ready or merged. Run `npm run lint` separately because the current `npm run build` runs tests and bundles but does not include the TypeScript lint script.

## Next steps

1. Review and merge stacked PRs in migration order after full checks.
2. Apply Phase 1–5 migrations to staging and perform real authenticated owner-isolation tests.
3. Add end-to-end billing/AI top-up test harness; reconcile payment fulfillment with account entitlements.
4. Finalize proration, cancellation, subscription invoices, VAT/tax and refunds.
5. Only then add real subscription checkout, plan-management actions and payment documents to the customer-facing page.
6. Keep production flags off until independently approved commercial launch.

This work is explicitly **read-only and non-activating**.
