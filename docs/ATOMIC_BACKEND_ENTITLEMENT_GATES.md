# Atomic plan limits — staging migration, OFF by default

## Motivation
Previously the backend entitlement guard read the owner's resource counts before
submitting an independent database write. Two replicas could both pass that
check, and a legacy writer could bypass it entirely.

## Database enforcement
The migration `20261019175500_atomic_plan_capacity_guards.sql` adds a private
single-row control table `billing_entitlement_enforcement`, created with
`enabled=false`. No activation is part of this change.

Four AFTER INSERT / UPDATE triggers enforce resource growth in PostgreSQL:
- `source_channels`: enabled monitored sources
- `destination_targets`: enabled personal repost targets
- `promotion_targets`: enabled campaign targets
- `promotion_campaigns`: ready/running campaigns

Every capacity-increasing mutation obtains the **same PostgreSQL transaction
advisory lock for its authenticated owner**, counts the resulting active
resources and rejects an over-cap mutation using SQLSTATE `PZ409`. The
rejected row and the owning transaction roll back. All existing enabled
items may be edited or disabled without increasing capacity. Deletes are
unaffected. The database's effective active subscription and plan caps
are authoritative, with absent/expired subscriptions falling back to Free.

Personal and promotional destinations share **one** capacity count. The
transaction lock is account-scoped, so writes for independent owners need
not contend. Enterprise nullable limits are unlimited.

The policy table has RLS and is inaccessible to regular authenticated users.
Any enabled policy with a missing or misconfigured Free plan fails closed.
API errors become generic `409 PLAN_LIMIT_REACHED`, without SQL or PII.

## Activation prerequisites
- Apply the migration to **staging Supabase only**, verify `enabled=false`
  and ensure existing resources and orders were not altered.
- Run clean CI, mocked PGlite quota tests and concurrent Postgres integration
  tests using independent database sessions. PGlite alone does **not** verify
  concurrent writes across separate PostgreSQL connections.
- Verify all scheduled/background writer paths, owner changes, and multi-row
  statement behavior with activated policy in a disposable environment.
- Check downstream frontend error handling, downgrade rules, Team seats and
  AI usage limits, especially in-flight work after expiry.
- Explicit authorization is required **before enabling the policy row, the
  Railway preflight environment flag, or accepting payments**.

The database trigger policy and the API preflight flag are deliberately
independent switches; both remain OFF after installation. No production
migration, live blockchain payment, commercial feature activation, or
automatic Telegram alerts are included.
