# Custom Sales Plans — Runtime Compatibility, Not Commercial Launch

**Branch:** `feat/sales-custom-plan-compatibility`  
**Base:** `feat/commercial-staging-integration`  
**Status:** Draft development; no new DB migration, no release flags enabled.  
**Predecessor:** [Custom draft-tier editor](./SALES_PLAN_CUSTOM_DRAFTS.md), including staging migration `20261019173245_custom_sales_plan_drafts.sql`.

## Objective

Make the already-developed dynamic custom draft IDs compatible with runtime subscription resolution, checkout candidate validation, customer billing overview, AI allowance calculation and source/destination/campaign preflight without creating paid access accidentally.

**Custom-tier publication remains forbidden in PostgreSQL.** The `billing_plans_custom_draft_only_check` constraint rejects `is_published=true` for every `custom_` ID. The two additional server flags below are also OFF by default. This stage has **zero customer-facing commerce impact** and never alters the existing crypto watcher.

## Runtime contract

Custom ID format is `^custom_[a-z][a-z0-9_]{2,29}$`. It represents a *possible* catalog key, not an entitlement. Arbitrary strings cannot become plan IDs just by being supplied as an HTTP field.

| Decision | Required conditions |
|---|---|
| Show built-in catalog prices in prelaunch | Existing read-only catalog preview; existing enablement constraints |
| Offer a custom plan in live checkout | Existing checkout/crypto/billing flags, `TGREPOSTER_CUSTOM_TIER_CHECKOUT_ENABLED=true`, matching **published+enabled** catalog row |
| Issue EUR→USDT custom quote | Both checkout gates, syntactically validated ID, **server-fetched** published+enabled catalog price |
| Convert custom quote to pending paid order | Re-check published+enabled custom tier inside locked order transaction; uses existing verified crypto-invoice infrastructure |
| Recognize custom active subscription | In-period active snapshot, `TGREPOSTER_CUSTOM_TIER_ENTITLEMENTS_ENABLED=true`, matching **published+enabled** catalog row with valid positive prices |
| Count custom tier source/destination/campaign capacities | Uses the safe effective-plan resolver; published+enabled catalog row and existing `TGREPOSTER_BACKEND_ENTITLEMENTS_ENFORCED` preflight switch |
| Allocate included monthly Units | Locked grant service uses same safe effective-plan resolver; Free fallback if custom is ineligible |
| Show customer Billing & Usage | Own subscription snapshot; same data-backed effective-plan resolver; no client-provided owner identity |
| Preview change to a custom plan | Non-binding and separately gated; both rows must be published and enabled; no order/refund is created |

If the tier has no published record, is disabled, has invalid prices, has a missing/invalid billing term, or the custom entitlement gate is OFF, the resolver returns **Free** instead of granting an invented paid entitlement. Errors querying the catalog propagate to backend callers (fail closed) rather than assuming customer access.

Already-paid *built-in* subscription resolution is unchanged. No customer records are changed as a result of the compatibility code.

## Code ownership

- `server/billing/customPlanEligibility.ts`: central gate, syntax validation, resolver and catalog eligibility query.
- `server/billing/customerCheckoutService.ts`: catalog discovery and quote request filtering.
- `server/billing/checkoutQuoteService.ts`: backend catalog price, published/enablement checks for all candidate tiers.
- `server/billing/subscriptionCheckoutService.ts`: defense-in-depth plan validation at quote-to-invoice order preparation.
- `server/billing/backendEntitlementGuard.ts`: prelaunch source/destination/campaign gating.
- `server/billing/monthlyAIAllowance.ts`: conservative AI grant effective plan.
- `server/billing/billingOverviewService.ts`: owner-specific read-only effective plan display.
- `server/billing/planChangePreview.ts`: published/enablement requirement for non-binding previews.
- `tests/customPlanCompatibility.test.ts`: invalid IDs, inactive terms, independent gate behavior, wrong catalog record, bad prices, and actual PostgreSQL draft-only publication constraint.

## Security and compatibility notes

- SQL remains parameterized. No customer-provided prices, rates, wallet addresses, or owner selectors.
- Publication is guarded in **database**, so even enabling a feature switch cannot activate the current custom drafts.
- The existing `main` production environment and Supabase production migrations are unchanged.
- The customer checkout and billing-worker switches remain OFF; no live invoices can be issued for custom tiers.
- This change is not a general plan-administration release: super-admin publication, paid mid-cycle plan transitions, taxes, refunds and legal price disclosure must be handled separately.
- The backend source/destination/campaign capacity preflight remains **not atomic under concurrent multi-replica writes**. Production enforcement requires transactional capacity reservation/locking.
- The Phase 11 real-Supabase two-account customer authentication exercise and full live payment→entitlement acceptance are still outstanding.

## Release gates before custom-tier publication

1. Build an explicit super-admin-only audited publication workflow; remove/replace the custom-draft SQL publication prohibition only after a complete reviewed migration.
2. Add server-side transactional source/destination/campaign allocation checks that survive concurrent requests, plus downgrade-safe treatment of existing records.
3. Validate pricing catalog/quoted EUR price/USDT invoice/order/snapshot invariants, paid-term renewals, monthly Units and replay against actual staging database and both customer accounts.
4. Approve refund/proration, VAT/invoices, stablecoin and conversion policies.
5. Run all CI suites and separately authorized staging acceptance before any production release.

**Do not enable any of the new switches while custom-tier publication is forbidden or before controlled acceptance.**
