# Commercial AI cost reconciliation — staging operations

**Status:** Code development only. This worker is **not enabled** in staging or production.
Keep the existing commercial launch gates OFF unless separately authorized.

## Purpose

After a TGReposter-funded OpenRouter request, a network error can leave its
final cost unknown. A pending AI Unit reservation must stay held. It must
never be automatically refunded or recorded as zero simply because an
HTTP request timed out.

The reconciliation service verifies a **known** OpenRouter generation ID
against the server-owned OpenRouter account, then uses the existing
transactional `settleAiUnits` flow with the authoritative `total_cost`.
Unknown output state is recorded as `failed` rather than falsely claiming
the customer received content.

Requests **without** a known generation ID remain pending for operator
review. The worker cannot safely guess the generation or a payable amount.

## Launch gates (all required)

- `TGREPOSTER_COMMERCIAL_AI_ENABLED=true`
- `TGREPOSTER_AI_RECONCILIATION_ENABLED=true` (independent opt-in)
- `DATABASE_URL` set to the intended **staging** database
- `TGREPOSTER_OPENROUTER_API_KEY` set to the same server-owned provider
  account that generated the original request

No key is returned to the browser. This is an internal Railway scheduler,
not a customer API. **Do not enable these flags until explicitly authorized.**

## Required migration

Apply `supabase/migrations/20261021154000_ai_reconciliation_backoff.sql`
to the staging database **before** turning on this new worker.

The migration adds `reconciliation_attempts` and
`reconciliation_next_attempt_at` plus a lookup index. These record
metadata only: no existing AI credits, subscriptions or usage statuses
are modified. Do not apply production migrations without approval.

## Bounded iteration and retries

- Default interval: **15 minutes**, minimum 15 minutes, maximum 24 hours.
- `TGREPOSTER_AI_RECONCILIATION_INTERVAL_MS`: optional interval override.
- Default batch: **10**, upper limit **20**.
- `TGREPOSTER_AI_RECONCILIATION_BATCH_SIZE`: optional batch size.
- One PostgreSQL advisory lock per environment prevents multiple Railway
  replicas from running reconciliation batches in parallel.
- Each due request is atomically marked as attempted **before** the provider
  lookup. The retry schedule begins at one hour and backs off to 24 hours.
- Failed lookups never automatically settle or release held credits.
- Provider generation lookups have a 10-second maximum deadline, even if
  an HTTP adapter fails to honor cancellation signals.
- Logs emit only aggregate counts and stable error codes, never customer
  principals, prompts, wallet addresses, generation IDs or API keys.

## Operational acceptance checklist

1. Confirm migration is present on staging and the current GitHub commit has
   been deployed successfully to the **separate staging Railway project**.
2. Verify prelaunch status: no reconciliation scheduler is started with
   the flags absent/default disabled, and no paid customer flows are exposed.
3. Using synthetic ledger fixtures only, simulate a pending OpenRouter
   generation with a provider-reported authoritative cost. Check exactly one
   settlement, correct owner and exact AI Units.
4. Simulate 429, timeout, unavailable generation and database failure;
   each must leave the usage pending, respect backoff and log no secrets.
5. Check pending requests without generation IDs are observable by an
   authorized operator and are never auto-refunded.
6. Complete staged operational and compliance review before enabling any
   live commercial/automatic reconciliation processing.

**Important:** This mechanism cannot resolve generations for which no
provider ID was recorded; these remain a separate operator-review backlog.
