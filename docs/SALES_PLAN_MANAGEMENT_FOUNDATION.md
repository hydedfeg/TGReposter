# Sales Plan Management — Stage 1 (Draft Catalog Editor)

**Status:** implemented on a staging-targeted feature branch; production remains unchanged.
**Parent:** `feat/commercial-staging-integration`.
**In scope:** editing existing Free, Creator, Professional, Business, Agency and Enterprise draft catalog definitions.

## Why this stage deliberately excludes arbitrary new tier IDs

The current database has a strict `billing_plans_id_check` that admits exactly six plan IDs. The effective-plan resolver (`server/billing/planCatalog.ts`) and customer checkout (`server/billing/customerCheckoutService.ts`) also enumerate fixed plan IDs. Creating new tiers in the database alone would create potential purchased entitlements the server cannot safely recognize.

This stage intentionally **does not** bypass those guards. A follow-up migration must generalize plan identity handling, and verify plan enforcement, quoting, renewal, historical contracts, FX conversion and role-scoped operations before enabling custom-tier creation.

## Implemented

- Authenticated **super-admin-only** `GET /api/admin/sales-plans`: six normalized plan records, features and assignments, editor/publication state.
- Super-admin-only `PUT /api/admin/sales-plans/:id`: validates *exactly* the supported draft fields (prices in integer EUR cents, user/source/destination/campaign limits, history retention, monthly AI Units up to six decimals, monitoring/support classes, feature assignments and enabled flag).
- `TGREPOSTER_SALES_PLAN_EDITOR_ENABLED=true` must be set on the backend to save. By default edits are **disabled**. Reads require super-admin authentication even while editing is disabled.
- Updates are PostgreSQL transactions with `SELECT FOR UPDATE` and an optimistic `catalog_revision`. Stale edits fail with 409; the UI refreshes.
- A single append-only `billing_plan_change_events` audit record stores the actor principal, previous/new revision and before/after snapshots. Canonical configuration remains in normalized `billing_plans` and `billing_plan_features`.
- A separate `is_enabled` flag controls availability of a plan in the draft/customer catalog. **Neither this flag nor saving a draft sets `is_published=true`**. Disabled plans are excluded from the catalog, and disabled/unpublished plans cannot obtain a new server quote.
- Published plans and plans with active/past-due/paused subscribers cannot be changed by this stage. The operator must use an approved financial migration to modify already-sold contracts.
- `salesPlans` super-admin workspace view under System administration, responsive form with feature assignments and clear disabled/editor status, navigation localization in English/Persian/Arabic/Russian, and localized status messages.
- Backend role check is independent of frontend visibility. User/admin roles cannot read the global catalog or update it; requests with spoofed owner or unauthorized access are not accepted.

## Database migration

`supabase/migrations/20261019180000_sales_plan_management.sql`

Adds:
- `billing_plans.is_enabled boolean not null default true` (existing drafts retain their current selectable status);
- `billing_plans.catalog_revision integer not null default 1` and positive revision constraint;
- `billing_plan_change_events` with owner actor, FK to the plan, unique plan/revision, JSONB **audit snapshots only**, private RLS, revoked browser privileges and backend service-role read/insert.

Migration does not add an account, subscription, invoice, published product, charge, or automatic entitlement.

## Test coverage

`tests/salesPlanAdminRoute.test.ts`: 401 without a session, 403 for regular content admin, 200 for super-admin, schema-absence fail-closed, input-path validation, private/no-store responses.

`tests/salesPlanAdminService.test.ts`: real commercial baseline plus migration loaded in isolated PGlite; six unpublished plans, no direct browser table access, atomic plan changes and feature assignments, audit event and actor, no repeat stale-write, blocked invalid Free price/unknown feature/published plan/active subscriber, and disabled-by-default before database access.

Staging PostgreSQL DDL/constraint verification used `BEGIN` + the migration + an insert/update/audit smoke test + `ROLLBACK`. No test data persisted.

## Security / rollout notes

- Do **not** enable `TGREPOSTER_CUSTOMER_CHECKOUT_ENABLED`, `TGREPOSTER_BILLING_WORKER_ENABLED`, `TGREPOSTER_SUBSCRIPTION_CHECKOUT_ENABLED` or `TGREPOSTER_COMMERCIAL_AI_ENABLED` as part of this work.
- Do **not** publish existing or new plans without verifying real customer sign-in, payment confirmation/fulfillment and pricing/tax/refund policy.
- Database migration must be applied to **staging before deploying** server queries that reference `is_enabled` or `catalog_revision`; reversing that order will break checkout preview queries.
- Do **not** apply this migration to production without a separate explicit release decision.
- Plan editing intentionally cannot change plan IDs, create/delete plans, alter customers' existing subscriptions, change the crypto receiving address, or issue a payment invoice.

## Next implementation stages

1. Generalize plan ID constraints, resolver and all purchase/renewal services, then add safe create/archive for new tiers with backend validation and no historical contract rewrites.
2. Implement **server-side** source/destination/campaign limits, including atomic create operations and downgrade-safe grandfathering. UI counters alone are not enforcement.
3. Enforce AI Unit budgets at the curation provider boundary, with paid-provider reconciliation and ledger safety.
4. Validate real two-account staging Supabase Auth, checkout→confirmed crypto invoice→subscription→AI credit flow and finance exceptions.
5. Operator publication/launch action only after plan limits, taxes, refunds and confirmation policies pass a release gate.
