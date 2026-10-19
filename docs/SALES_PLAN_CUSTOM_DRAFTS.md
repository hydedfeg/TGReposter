# Custom Sales Plan Drafts — Stage 2

**Repository:** TGReposter  
**Branch:** `feat/sales-plan-custom-drafts`  
**Parent:** `feat/commercial-staging-integration`  
**Release status:** Draft PR only; this stage does not activate customer commerce.

## Scope

Build on the six-tier super-admin editor (Phase 1, PR #58) by allowing **new draft** tiers to be authored. The database and API **refuse to publish** these tiers, and the effective-plan resolver/quote/checkout allowlists still only recognize the original six IDs. This deliberately prevents a new tier from becoming a paid subscription without dedicated compatibility and financial testing.

## New draft identifiers

IDs must match `^custom_[a-z][a-z0-9_]{2,29}$` and cannot reuse reserved identifiers like `creator` or `enterprise`. Creation assigns the next unique sort order and initial revision 1. Existing built-in plans are unaffected.

## Database

Migration: `supabase/migrations/20261019173245_custom_sales_plan_drafts.sql`.

- Expands `billing_plans_id_check` to accept safe custom IDs in addition to the built-in six.
- Adds `billing_plans_custom_draft_only_check`, refusing `is_published=true` for **every custom tier**.
- Extends the existing private, append-only plan audit revision constraint to allow the initial creation event (revision 0 → 1), without loosening the rule for later edits.
- Retains current positive-price/non-null limit checks, FK constraints, catalog RLS and revoked browser access.
- Does not insert any plan or alter subscription, payment, invoice or AI Unit data.

## Backend

The super-admin-only `POST /api/admin/sales-plans` accepts `{id, revision:1, displayName, monthlyEurCents, annualEurCents, maxUsers, maxSources, maxDestinations, maxActiveCampaigns, historyDays, monthlyAiUnits, monitoringPriority, supportTier, isEnabled:false, featureCodes}`.

- Requires `TGREPOSTER_SALES_PLAN_EDITOR_ENABLED=true`, otherwise fails with 503.
- Requires an authenticated super-admin (same middleware as the original editor).
- New tier is **both disabled and unpublished**. The request cannot set a publication field.
- Enforces a maximum of 60 total tiers and requires all features to come from `billing_features`.
- Uses a PostgreSQL advisory transaction lock for catalog-wide creation, unique IDs/sort orders and atomic normalized feature assignments.
- Appends actor/previous revision 0/next revision 1 plus a JSONB **audit snapshot only**; normalized pricing and features remain canonical.
- `PUT /api/admin/sales-plans/:id` can then edit the **unpublished** custom draft with optimistic revision checks and subscriber protection. No create/delete/publish override is offered.

## UI

The authenticated super-admin Sales Plans editor has a `New draft tier` action, validates the safe ID format, and reuses the existing price/usage/feature form with revision 1 and disabled default. UI labels support English, Persian, Arabic, and Russian. The button is inert if the editor enablement flag is off.

## Tests and evidence

- PGlite integration tests load the real commercial foundation, existing editor migration, and new custom draft migration to validate normalized creation, ID collisions, known features, audit events, revision updates and the PostgreSQL publication constraint.
- HTTP tests check 401/403 for anonymous/non-super-admin and successful super-admin-only creation.
- Separate **staging Supabase PostgreSQL** transactional smoke test completed with `BEGIN` → migration → custom plan + feature + audit → forced publication rejection → `ROLLBACK`. No persistent staging schema edits or custom accounts were made.
- GitHub CI must pass TypeScript, tests, audit and production build before the draft PR is eligible for merge.

## Important remaining work

Custom tiers **must not be sold yet**:
1. Generalize the authoritative plan ID resolver with DB-verified membership, without trusting arbitrary JWT or client plan claims.
2. Generalize the customer checkout catalog and quote selection to eligible published plans rather than a hard-coded allowlist, with proper payment/terms/tax/rate policy and snapshot safeguards.
3. Reconcile subscription lifecycle, renewal scheduling, credit grants, history/reporting and downgrade-safe quota enforcement for new identifiers.
4. Migrate the SQL publication constraint only after a separate commercial readiness approval, and add an explicit, audited publication flow with safeguards against already-sold plan changes.
5. Complete multi-tenant staging Auth tests, real payment→entitlement acceptance if authorized, and final production release review.

**Do not deploy this feature before its migration is reviewed/applied in staging, and never apply it to production as part of an unapproved billing rollout.**
