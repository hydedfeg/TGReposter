# Phase 8 — Non-binding Plan-Change Pricing & Financial Workflow Validation

**Branch:** `feat/plan-change-financial-validation`  
**Base:** `feat/subscription-lifecycle-safety`  
**Status:** Inactive preview and offline integration tests. No production billing activation.

## Design decision: estimate, do not charge

Phase 8 adds a **non-binding estimate** for a change between two published
paid plans, within the *same* monthly or annual interval. The current purchase
and entitlement workflow continues to block actual mid-cycle plan changes.

The billing policy itself—including credits, taxes, refunds, change-of-term
rules and consent—is not yet approved. Consequently no priced quote, invoice,
USDT payment request, subscription modification, or AI Unit grant may be
created by this preview.

### Calculations (draft policy only)

Given a current fully paid term with prices in integer EUR cents:

```text
remaining fraction = (paid term end - current time)
                     / (paid term end - paid term start)

upgrade illustrative difference =
  ceil((target term list price - current term list price)
        × remaining fraction)
```

All arithmetic is exact `BigInt` integer arithmetic using timestamps in
milliseconds and cents, then rounded **up** to a whole EUR cent. It does not
use floating-point currency arithmetic. Example:

- Creator €15/month → Professional €39/month
- Precisely half the current paid term remains
- Illustrative additional value: **€12.00**
- The actual checkout amount is **not** established by this calculation.

For downgrades, the preview shows the proposed effective date as the current
period end and **no automatic cash refund**; any policy for credit/refund of
unused paid time needs commercial and legal approval. This is *not a promise*
that a downgrade will automatically occur. For upgrades, the illustrative
effective date is now, subject to verified payment and a future independent
fulfillment system.

Annual changes use the catalog's annual period prices and the exact paid
annual term; the service does not treat annual plans as twelve separately
purchased subscriptions.

### Safety boundaries

- Both plans must be valid, published, different paid plans; Free and
  Enterprise require separate policies.
- Account's effective subscription must be active and unexpired.
- Cannot preview when end-of-term cancellation is set.
- Cannot preview with a prepaid scheduled term or unresolved invoice.
- The server derives `owner_principal` only from the authenticated session.
- API rejects extra query parameters such as `ownerPrincipal`.
- No client-selected source-plan or price is accepted.
- Endpoint requires the default-OFF
  `TGREPOSTER_PLAN_CHANGE_PREVIEW_ENABLED=true` flag.
- The response explicitly includes `kind: non_binding_estimate`,
  `checkoutEnabled: false`, `policyStatus: requires_approval`.
- The response is private and `Cache-Control: private, no-store`.
- No new user-facing purchase/upgrade/downgrade controls were enabled.

### API

```http
GET /api/billing/subscription/change-preview?targetPlanId=professional
Authorization: Bearer <customer-session>
```

When preview is disabled, the route responds with 503. A successful preview
reports the target term's EUR list price, illustrative unused-period
difference, intended effective date and explicit non-binding status. It is
not a billable quote and does not authorize payment.

## Financial workflow integration regression

`tests/billingFinancialWorkflow.integration.test.ts` creates a private
in-process PostgreSQL-compatible PGlite database and applies the actual
commercial SQL migrations.

It creates synthetic invoices and on-chain confirmation records. It then
calls the **real service functions** (not mocks) for:

1. Refusal to fulfill a subscription when its invoice is unpaid.
2. Validation of a fully paid, matched confirmed chain event.
3. Atomic activation of exactly one owner-scoped subscription term.
4. Idempotent retry of the same paid subscription fulfillment.
5. One included monthly AI Unit grant sourced from the published plan.
6. No second allowance grant when retried.
7. A separate synthetic AI top-up: refusal when unpaid, exact confirmed
   amount/receiver/token verification, one purchased-credit grant, and
   idempotent fulfillment.
8. Rejection of another tenant's attempt to fulfill Alice's top-up.

The service functions now accept an **optional transaction client factory**
for isolated test execution, with production still using the PostgreSQL
connection pool. The test-only `enabled` overrides MUST never be connected
to client-supplied HTTP options.

These tests are synthetic. They do **not** perform on-chain transfers, exercise
the live crypto watcher or substitute for a real USDT test payment.

Additional regression suites:

- `tests/planChangePreview.test.ts`: price rounding, annual/monthly
  arithmetic boundaries, expired terms, unpublished plans, paid renewal
  conflicts, owner scoping and disabled-by-default behavior.
- `tests/planChangePreviewRoute.test.ts`: authenticated owner, fail-closed
  feature switch, reject identity overrides and conflict status.

## Database verification

On connected TGReposter **Staging** Supabase, all seven commercial
migrations and the three plan-change SQL queries were compiled inside one
transaction and rolled back.

Confirmed:
- no automatic subscription enrollment;
- no published products;
- no direct browser access to private billing tables;
- correct query dependencies against current PostgreSQL schemas.

**No staging or production database mutation was left behind.**

## Important remaining launch blockers

1. Approval of proration, upgrade timing and downgrade/refund policies
   including partial periods, taxes/VAT, and promo prices.
2. A *separate* atomic, owner-scoped payment-linked plan change order and
   fulfillment ledger; estimates alone must never grant access.
3. Policy and implementation for mid-cycle AI allowance adjustment without
   granting overlapping monthly included credits.
4. Explicit customer consent and a final authoritative USDT amount quote
   at checkout time (with conversion risk and transaction fees disclosed).
5. Chargeback/refund and disputed payment operations.
6. Full integration of the chain watcher on staging with actual safe test
   transfers and replay/concurrency tests.
7. Review and merge the stacked PRs in migration order; apply migrations
   to staging only after automated test and security approval.
8. Run a separate TypeScript lint/build and assess access enforcement
   before enabling billing or subscription management flags.

**Production billing, upgrades and downgrades remain disabled.**
