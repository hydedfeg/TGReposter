# TON Center API rate-limit recovery

The staging TON scanner received `RPC_RATE_LIMITED` (HTTP 429). This
change makes scanner calls respect bounded provider `Retry-After` hints and
uses TON-only exponential cooldown (1, 2, 4, 8, then 15 minutes maximum).

- No sleeping under the payment scheduler's PostgreSQL advisory lock.
  BSC and Ethereum continue to scan on each scheduled run.
- A TON cooldown returns `ok:false, skipped:true` and a safe `retryAt`;
  it never claims a successful scan, reads transfers, updates network
  cursor, marks invoices as paid, or grants credits.
- Scheduler warnings report actual newly failed scans but do not repeat a
  warning on every deliberate cooldown skip.
- On the next eligible successful TON scan, cooldown resets. Other errors
  (401/403, parse failures, timeout) are **not** rate-limit retried.
- `Retry-After` accepts positive delta-seconds or an HTTP-date only and
  is capped at 15 minutes. Raw headers, provider responses and API keys
  never enter diagnostics.

## Limitations
Cooldown is **per Node process** and resets after restart. The invoice/scan
cursor remains durable in PostgreSQL. A future horizontally scaled rollout
should share provider cooldown state across replicas. Enabling paid customer
checkout remains blocked pending merchant readiness and authorized payment
acceptance. No changes to production, wallets, confirmation requirements,
billing grants, or commercial flags.
