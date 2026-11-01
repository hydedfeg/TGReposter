# OpenRouter Commercial AI Metering — Phase 2

**Status:** Feature-branch implementation; NOT activated for live customers  
**Branch:** `feat/openrouter-commercial-metering`  
**Base:** `feat/commercial-data-foundation`  
**Product requirements:** [Pricing and Sales Plan](./PRICING_AND_SALES_PLAN.md) on `main`

## Scope delivered

Phase 2 introduces commercial, TGReposter-funded OpenRouter mechanics
**alongside** the existing per-user-key AI route. Existing AI requests retain
their original payload and response contract, so no existing customer is
charged AI Units or forced to change their saved provider settings.

- Cached text-only model catalog using `GET https://openrouter.ai/api/v1/models`.
- Authenticated `GET /api/ai/openrouter/models` endpoint returning safe,
  validated model metadata, pricing and context/output limits.
- Optional generation ID, model ID and `usage.cost` extraction in the existing
  OpenRouter adapter, enabled only by commercial callers.
- Decimal-safe USD-to-AI-Units math (100 units per USD of billed inference
  value) and conservative bounded preauthorization estimation.
- Owner-scoped, transaction-locked reservation service.
- Idempotent actual-cost settlement with separate included and purchased
  AI Unit ledger adjustments.
- Persistent OpenRouter generation IDs and pending reconciliation notes.
- An explicitly unmounted commercial request orchestration module.
- Unit tests for cost conversion, model discovery, cost verification and
  reserve-before-provider behavior.

## Important boundaries

### 1. No automatic launch

`server/billing/commercialOpenRouterService.ts` has no live route. The existing
`POST /api/ai/curate` and Promotion AI routes still use the customer-specific
credentials, and existing Gemini compatibility remains temporarily intact.

The planned OpenRouter-only commercial cutover is a **separate feature-flagged
release**, once included monthly credits and billing fulfillment work.

### 2. Reliable cost source

Use OpenRouter's **`usage.cost`** field for billed cost. Do not infer a
customer charge from prompt/output token counts or
`cost_details.upstream_inference_cost`.

If cost is absent or provider success is uncertain, keep the request
`pending` and retain the balance reservation. When possible, record
`provider_generation_id` for authoritative reconciliation using
`GET /api/v1/generation?id=...`.

An empty AI output can still incur a nonzero provider bill. The settlement
path charges the actual billed cost even when the output cannot be used.

### 3. Reservation algorithm

```text
Trusted owner / period / model / idempotency key
        ↓
Resolve compatible priced text model from catalog
        ↓
Bound output and conservatively estimate maximum AI cost
        ↓
BEGIN + owner advisory transaction lock
        ↓
Check remaining included-period Units and purchased Units
        ↓
Insert PENDING AI usage event (unique owner + request key)
        ↓
Debit included Units first, then purchased Units
        ↓
COMMIT
        ↓
Call TGReposter-owned OpenRouter key
        ↓
Read returned usage.cost
        ↓
BEGIN + same owner lock
        ↓
Refund unused reservation or record excess provider charge
        ↓
Mark usage SUCCESS/FAILED once, COMMIT
```

A retry with an already-reserved request key is rejected before another
provider call, protecting against duplicate cost.

Unexpected actual cost exceeding the reservation becomes a recorded
purchased-balance debt; further reservations must account for that debt.

### 4. No implicit granting of Units

This phase does **not** grant plan allowances or permit clients to allocate
their own credits. A future server-side subscription service must use the
authoritative published `billing_plans` catalog to allocate included Units
exactly once per billing cycle and to process purchased top-ups only after a
verified payment fulfillment event.

Free-plan monthly grants must also be handled by that server-side service
once commercial billing is activated.

### 5. Security and data

- All account identities are resolved by trusted backend callers, never
  accepted from the user's request body.
- The OpenRouter API key must be a server-side-only
  `TGREPOSTER_OPENROUTER_API_KEY` variable; it is never returned by any endpoint.
- Browser roles have no direct table privileges on commercial ledgers.
- All usage and credit transactions use the owner's ledger key and are
  serialized under a PostgreSQL advisory transaction lock.
- Period-scoped included credits return to their original billing period;
  purchased credits are not period-limited.
- Commercial charging remains **disabled** until full billing lifecycle
  tests and launch approvals are complete.

## Validation

- Unit tests added:
  - `tests/aiUnits.test.ts`
  - `tests/openRouterModelCatalog.test.ts`
  - `tests/commercialOpenRouterService.test.ts`
  - commercial-mode regression cases in `tests/openRouterProvider.test.ts`
- Both commercial migrations executed together on the connected **staging**
  Supabase database within a transaction. Checks covered:
  - unpublished plans / no subscription enrollment;
  - no browser access;
  - owner-scoped usage + ledgers;
  - cross-owner FK rejection;
  - storing OpenRouter generation IDs and settling usage.
- Transaction ended with `ROLLBACK`; **no commercial tables remain
  deployed to staging or production**.
- Full repository `npm test`, `npm run lint` and `npm run build` must be
  reviewed in CI before merging; not claimed to have run locally here.

## Next engineering steps

1. Run CI and fix test/type errors before merging this PR.
2. Implement authenticated, backend-issued monthly AI Unit grants tied to
   published plan, subscription period and owner.
3. Implement top-up credit grants tied to idempotent verified payment orders.
4. Add provider generation reconciliation worker for pending charges/timeouts.
5. Build dynamic model selector UI and recommended-model rules.
6. Add a feature-flagged migration from per-user API keys to the
   TGReposter-funded OpenRouter service.
7. After reconciliation and billing tests: enable cost-based AI limits.
