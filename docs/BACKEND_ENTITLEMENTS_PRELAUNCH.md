# Backend plan entitlements: prelaunch read-only capacity gates

## Release boundary

This increment adds a disabled-by-default, **server-only** gate:
`TGREPOSTER_BACKEND_ENTITLEMENTS_ENFORCED=true` would be required for
enforcement. Neither staging nor production enables it here; do not activate
the gate or customer USDT checkout as part of this PR.

An authenticated owner's current subscription is resolved through existing
`getEffectivePlanId` lifecycle logic. Missing, expired, paused, canceled,
future-start or past-due subscriptions resolve to Free. Limits come from
the database's `billing_plans` table; `null` caps are unlimited.

## First backend write checkpoints

- Adding a monitored source channel (`ChannelService.add`).
- Increasing enabled personal repost destinations when saving targets.
- Creating an enabled promotion destination or re-enabling a disabled one.
- Advancing a draft campaign to ready, launching a draft campaign or
  retrying a completed partial/failed campaign into the running state.

Guarded growth returns HTTP `409 PLAN_LIMIT_REACHED`. Reads, removals and
disabling records continue, allowing over-quota owners to clean up their data.
Each database read filters by the server-derived authenticated owner.
The destination count includes both personal and promotional targets,
consistent with the billing overview display.

## Limitations — must fix before activation

- These are **preflight checks, not atomic reservations**. Concurrent writes
  from different app replicas can see the same count and both pass. Introduce
  database-serialized owner-scoped checks and writes before enabling the flag.
- Complete the inventory of all legacy source/destination and campaign state
  write paths; enforce in database-bound business logic, not only selected
  REST routes.
- Align published billing usage and customer quotas with real-world product
  definitions, including duplicates and target identity in the two workflows.
- Implement server-enforced Team seat accounting, AI usage/ledger checks,
  plan feature flags and lifecycle/downgrade grace policies.
- Verify promotion and repost scheduled jobs honor entitlement expiry and
  that existing in-progress work cannot bypass limits.
- Agree on merchant tax, USDT refund and dispute policies independently.

Do not claim that commercial entitlements are fully enabled or protected by
this PR. No database migration or customer financial operation is included.
