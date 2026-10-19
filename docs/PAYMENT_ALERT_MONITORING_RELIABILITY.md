# Payment alert monitoring reliability

The staging payment alert processor intermittently reported PostgreSQL SQLSTATE
`XX000`. The raw PostgreSQL detail was not logged, and direct staging checks
have not reproduced the original database error. We do **not** claim its root
cause has been established.

## Change
- Background alert reconciliation reads only network checkpoints, bounded
  invoice exception candidates and bounded unassigned transfers, instead of
  invoking all eight payment operations dashboard queries every minute.
- These three queries are sequential and stage-tagged. A failed query aborts
  reconciliation **before** any journal mutation; a write failure rolls back
  the alert transaction and never treats a partial read as "no alerts".
- New diagnostics log only controlled stage and five-character SQLSTATE (such
  as `XX000`); raw SQL, error messages, wallet data and credentials are excluded.
- Dashboard API and its full query set remain unchanged.
- This does not alter payment scanner checkpoints, invoice/transfer matching,
  subscription fulfillment, retry policies, or Telegram alert delivery flags.

## Acceptance
- Database mock: exactly three SELECTs instead of eight.
- Fault injection: failure in any read causes zero journal writes; an update
  failure rolls back; sensitive database messages cannot enter error objects.
- Existing owner-isolation, deduplication and truncation safeguards still pass.
- Monitor stage-specific logs for any recurrence of `XX000`; do not claim
  resolved root cause until that evidence is available.

**Staging only**. Do not enable customer charging or automatic notifications,
and do not modify production or require live blockchain transfers.
