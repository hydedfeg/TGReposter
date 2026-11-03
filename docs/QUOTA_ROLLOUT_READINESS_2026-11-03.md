# Quota rollout readiness — November 3, 2026

## Findings

Read-only staging inspection found two owners with source/destination/campaign resources. Neither exceeds the current effective plan's source, combined destination, or active-campaign limits. No subscription, subscription order, AI top-up order, AI ledger entry, or published plan exists. Database entitlement enforcement is disabled.

The current trigger resolves any active subscription's plan ID directly from the catalog. The backend instead falls back to Free for unknown or unapproved custom plan IDs. A subscription row referencing a custom draft could therefore obtain larger limits through a direct database write after enforcement is enabled.

## Candidate correction

`20261103124022_restrict_capacity_to_approved_builtin_plans.sql` replaces only the existing trigger function. Effective database plans are restricted to the six supported built-in IDs; an unknown/custom identity uses Free limits. It preserves the owner advisory lock, current-period checks, shared destination accounting, disabled-resource treatment, owner attribution, function privileges, and disabled-by-default switch. Built-in paid terms retain their limits even if their catalog product is later delisted. Custom database entitlements require a separately reviewed rollout policy.

Regression coverage checks custom and unknown identities across all three resource categories. The PostgreSQL 17 CI job also checks competing transactions for Free, custom-draft fallback, built-in paid sources, and the shared personal/promotion destination budget.

## Release boundary

Do not apply this migration or repair historical migration aliases before the actual encrypted staging backup and isolated restore gate is satisfied. Do not modify the enforcement flag as part of this correction. There are no live schema or data changes in this work.

The genuine-session UI inspection confirmed Alice's own source and campaign fixtures. A second secure sign-in returned Alice again, so two-account isolation remains unverified. No passwords were read/reset and no new users were created. Empty shared-looking billing views are not isolation evidence.

Still required: a private backup/restore target; distinct Bob test-session acceptance; migration parity review; paid checkout/fulfillment acceptance; and separately approved quota activation. Team-seat policy, monitoring priorities, and retention are separate implementation work.
