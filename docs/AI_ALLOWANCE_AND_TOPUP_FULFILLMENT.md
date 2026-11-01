# AI Allowance Allocation & Verified Top-up Orders (Phase 3)

**Status:** Implementation on feature branch; checkout and commercial AI charging remain disabled.

**Branch:** `feat/ai-monthly-credits`

**Dependencies:** Phase 1 commercial foundation, Phase 2 OpenRouter commercial metering, and pre-existing plan-agnostic USDT invoice infrastructure.

## Delivered

### 1. Backend-controlled recurring allowances

`server/billing/monthlyAIAllowance.ts` provides `ensureMonthlyAIAllowance(ownerPrincipal)`.

- Owner is supplied by a trusted server caller, never copied from request input.
- Account/subscription is resolved from `billing_subscriptions`.
- `billing_plans` is authoritative for monthly AI Unit quantities.
- Only **published** plans can create credits.
- The allocation service is inert unless `TGREPOSTER_COMMERCIAL_AI_ENABLED=true`.
- Free users receive a UTC calendar-month window when Free is published.
- Monthly subscribers use their stored subscription period.
- Annual subscribers receive 12 anchored, individually resetting monthly windows within the paid annual subscription period.
- Event keys ensure idempotency; the existing per-owner transaction advisory lock also serializes AI spend and allowance allocation.
- Overlapping grants from plan changes are **rejected** to avoid accidentally awarding two full allowances. A prorated/mid-cycle upgrade adjustment policy is **required before public launch**.
- Enterprise has no automatic quantity: its custom allowance must be defined in an approved contract before allocating credits.

### 2. Unpublished AI top-up catalog

`billing_ai_topup_packs` contains:

| Pack | Units | Listed Price |
|---|---:|---:|
| AI Mini | 500 | €7 |
| AI Plus | 2,000 | €25 |
| AI Pro | 5,000 | €55 |
| AI Max | 10,000 | €99 |

All top-up packs are created with `is_published=false`.

### 3. Invoice-linked AI top-up orders

`billing_ai_topup_orders` is a private, owner-scoped, normalized order record containing:

- owner principal;
- immutable product snapshot (pack, Units, EUR price);
- one unique linked crypto invoice;
- approved USDT quote amount and quote reference;
- order state (`pending`, `fulfilled`, `canceled`);
- fulfillment timestamp.

`server/billing/aiTopupService.ts` prepares orders only against an owner-matched pending invoice whose nominal USDT amount matches the trusted checkout quote. It cannot be called from a browser endpoint.

**EUR is not USD₮.** The currency-quote mechanism is not implemented in this phase. A future commercial checkout service must first create a trustworthy, server-controlled exchange-rate quote and then request the USDT invoice for that exact amount. The quote reference must not be self-asserted by clients.

`fulfillVerifiedTopup()` additionally requires:

1. the matching owner-scoped pending commercial order;
2. the linked invoice with `status='paid'` and `confirmed_at`;
3. a confirmed, finalized on-chain transaction assigned to the same invoice and owner;
4. exact network, token, receiving address and expected paid amount match;
5. a unique AI ledger grant key `topup:order:<id>`.

The order state update and purchased-AI ledger grant are a **single PostgreSQL transaction**. A repeated fulfillment cannot create a second credit.

Service-level activation is gated by `TGREPOSTER_COMMERCIAL_TOPUPS_ENABLED=true`, but **no feature flags were enabled or set anywhere**.

### 4. OpenRouter charge reconciliation

`server/billing/openRouterReconciliation.ts` provides:

- parsing of `data.total_cost` from `GET /api/v1/generation?id=<generationId>`;
- exact generation ID validation;
- retrieval only using the server-owned OpenRouter API credential;
- a bounded batch worker for pending requests with generation IDs;
- settlement through the Phase 2 idempotent ledger method;
- continued pending state when cost cannot be verified.

A generation lookup returning 404, timing out or omitting `total_cost` **does not mean the request was free**. No speculative refunds occur.

A separate scheduling mechanism is still required; the worker is intentionally **not scheduled** and has no customer-exposed endpoint.

### 5. Security boundaries

- All monetary and AI-credit tables have RLS and direct browser privileges revoked.
- Commercial grants are backend-owned.
- Owner matching is enforced in queries and relational constraints.
- No JWT user metadata, wallet addresses, private keys or browser-provided billing owners are trusted for authorization.
- No commercial plan or AI pack is published.
- Customer API routes still use the old AI configuration flow until deliberate commercial launch.

## Verification

- Combined Phase 1 + Phase 2 + Phase 3 SQL was executed as a **transactional dry-run** on TGReposter Staging Supabase.
- Verified catalog sizes, unpublished states, browser privilege revocations, FK tenant isolation, unique invoice IDs and unique AI credit events.
- Explicit `ROLLBACK` left staging unchanged.
- Added tests for calendar-month renewal boundaries, unpublished packs, cross-owner orders, and provider generation-cost parsing.
- CI `npm test`, `npm run lint`, `npm run build` must pass before merge; no claim is made that local full tests ran.

## Launch blockers / next actions

1. Commercial order checkout service and trusted EUR→USDT pricing quote.
2. Subscription plan activation/renewal fulfillment based on verified payment.
3. Mid-cycle upgrade delta and plan-change allowance handling.
4. Enterprise custom included-AI allocation policy.
5. Reconciliation scheduler and observability for generations without IDs.
6. Production integration tests that exercise `ensureMonthlyAIAllowance`, `prepareTopupOrder` and `fulfillVerifiedTopup` against PostgreSQL.
7. Billing UX, invoices, refunds and VAT handling.
8. Feature-flagged migration from existing personal-key AI into included TGReposter-funded OpenRouter AI.

**Do not publish pricing, enable the flags or merge this branch directly into production until launch blockers are addressed and the automated suite passes.**
