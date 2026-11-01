# Payment reconciliation hardening

## RPC log range recovery
The EVM watcher now recursively bisects only eth_getLogs range-size provider errors, up to six levels (at most 64 leaf intervals). Each half is disjoint and results are returned only after all halves succeeded; failing children prevent cursor advancement. Rate limits, auth errors and timeouts are not split. Operational diagnostics remain redacted.

## Expiration retry alignment
The existing billing scheduler already supports expiration operations, but the retry validator and checked-in migration did not. Align the validator and use a repeatable, additive CHECK update. Staging currently has the correct CHECK constraint; the migration is also needed for reproducible future installations.

## Rollout
Staging only. No wallet, payment settlement, commercial flags, production changes or live blockchain transfers. Run TypeScript, automated tests, and build before deploying.
