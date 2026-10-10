# Commercial Data Foundation — Implementation Notes

**Phase:** 1 / Commercial data model  
**Branch:** `feat/commercial-data-foundation`  
**Parent branch:** `feat/crypto-payment-infrastructure`  
**Reference:** [Pricing and Sales Plan](./PRICING_AND_SALES_PLAN.md) (approved baseline on `main`)

## Summary

This change adds database objects and pure domain rules required for
subscriptions and OpenRouter-based AI accounting. It does **not** launch billing,
enable paid entitlements, connect checkout, or change any existing customer's
monitoring, posting, or AI access.

### Schema

| Object | Purpose |
|---|---|
| `billing_plans` | Plan pricing, allowances and monitoring/support priority |
| `billing_features` | Feature registry with release state (`available`, `planned`, `retired`) |
| `billing_plan_features` | Normalized per-plan feature entitlements |
| `billing_subscriptions` | One per-owner current subscription state |
| `ai_usage_events` | Owner-scoped, idempotent OpenRouter request usage |
| `ai_unit_ledger` | Signed included/purchased AI Unit transactions |

The canonical plan IDs are `free`, `creator`, `professional`,
`business`, `agency` and `enterprise`.

Prices are stored as integer **EUR cents**, not floating-point EUR.
OpenRouter cost is stored separately in `numeric(22,10)` USD.
AI Unit amounts are stored in `numeric(18,6)`; **1 Unit represents
approximately USD 0.01 inference value** under the provisional
100 Units / USD 1 policy. The ratio and allowances remain subject to
commercial validation.

### Tenant isolation

The commercial tables use the existing backend-derived `owner_principal`
identity (`legacy:<username>` or `supabase:<user-id>`), not global settings.

All six new tables have RLS enabled, direct browser-role privileges revoked,
and backend-only access. Usage events and ledger links enforce matching
`owner_principal` using composite foreign keys. Request and ledger event keys
are idempotent within an owner.

No rows are automatically inserted in `billing_subscriptions`.
The pure `getEffectivePlanId` resolver returns `free` for absent,
unknown, inactive or expired subscriptions.

### Non-activation safeguards

- Every seeded plan has `is_published = false`.
- No billing route or existing content endpoint uses these objects yet.
- No existing account is migrated, charged, paused or upgraded.
- Roadmap features such as scheduling, advanced analytics, approvals,
  client workspaces and API/webhooks remain marked `planned`.
- Enterprise plan values use NULL to signify *custom negotiated entitlements*,
  not unlimited access by default.
- No existing tables were altered.

### Relationship with crypto payment infrastructure

This phase builds on the staging branch containing the plan-agnostic USDT
invoice/payment observer.

Do **not** insert pricing logic into `server/payments/` or the
`crypto_payment_*` settlement tables.

A later billing orchestration layer will:
1. create a commercial order for an owner and plan/top-up;
2. request an owner-scoped crypto invoice from the existing payment module;
3. correlate a confirmed payment to the order in an idempotent transaction;
4. grant a subscription period or AI Unit top-up;
5. create durable ledger/audit entries.

A payment's state must **not** directly confer account entitlements without a
separately validated commercial order and an idempotent fulfillment transition.

### AI settlement rules for Phase 2

- Use OpenRouter only at commercial launch.
- Before an AI request, check available included/purchased balance and
  reserve or cap estimated cost to prevent concurrent overspending.
- After a successful request, read actual OpenRouter usage/cost; settle once.
- Deduct included Units first, then purchased Units.
- Included grants must have their own monthly period, even for annual customers.
- Purchased Units are not scoped to a monthly period.
- On failure or timeout, reconcile any provider charge before issuing refunds
  or removing a reservation; do not assume a timeout means zero cost.
- Write the provider event plus balance changes atomically with idempotency.
- Do not store raw model/API secrets in billing records.

A `billing_plans` row is the authoritative source of limits and prices;
`server/billing/planCatalog.ts` intentionally defines only IDs and
subscription validity, not duplicated plan allowances.

### Testing and deployment state

A read-only transactional dry-run executed the migration on the connected
**TGReposter Staging** PostgreSQL project, checking:

- creation of six plans and six commercial tables;
- published flags remaining false;
- no auto-created subscription;
- correct Professional price;
- direct browser privilege revocation;
- duplicate-request rejection;
- required AI grant period;
- cross-owner usage-ledger foreign-key rejection.

The test ended with `ROLLBACK`; the staging database was left unchanged.

Automated regression coverage is added in:

- `tests/commercialFoundation.test.ts`
- `tests/commercialPlanResolver.test.ts`

**Before merging:** run `npm test`, `npm run lint`, and `npm run build`
in an environment with dependencies installed. This environment could not
run the repository's full Node test suite.

**Before applying to production:** merge the payment infrastructure and this
foundation in migration order, deploy to staging through the usual migration
workflow, validate, then approve a separate production migration rollout.

## Next implementation tasks

1. Add backend commercial catalog/entitlement reader (server-owned APIs).
2. Add transactional AI Unit reservation and reconciliation service.
3. Wire OpenRouter usage/cost capture and model registry.
4. Add accurate per-owner source/destination/campaign usage counters.
5. Add subscription order fulfillment integration with the existing crypto
   invoice layer.
6. Implement plan enforcement only after billing and migration tests pass.
7. Add billing UI, pricing page and customer checkout.

This phase deliberately stops **before** financial fulfillment or live
entitlement enforcement.
