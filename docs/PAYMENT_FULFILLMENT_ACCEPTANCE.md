# Fulfillment acceptance: simulated blockchain payments

No customer funds are transferred. The integration harness creates an isolated
in-process PostgreSQL-compatible database and loads commercial migrations.

## Payment finality defense in depth
Subscription and AI top-up fulfillment now require a confirmed transfer
with an explicit number of confirmations **at least equal to the configured
threshold for that network** (BSC 120, Ethereum 80, TON finalized 1 in
the current staging configuration). This check happens in addition to
invoice status `paid`, authenticated owner, exact amount, network,
canonical token identity, receiving destination and single-use order checks.

If a network is missing or disabled in server configuration, verification
fails closed instead of quietly accepting one confirmation. Only an internal
test dependency can supply fake network settings; no browser parameter or
HTTP endpoint can set a threshold.

## Acceptance matrix
- A confirmed, correctly attributed transfer grants one subscription term
  or a single purchase of AI Units.
- Underconfirmed, wrong-token, wrong-recipient, wrong-network and incorrect
  amount records are rejected without modifying entitlements.
- Attempts to credit another account are rejected.
- Duplicate fulfillment attempts do not add subscription terms or AI credits.
- Existing grant and idempotency tests continue to run.

## Scope
No database migration, wallet changes, payment enablement, production
deployment, blockchain transactions or automatic Telegram notification
activation. Run full TypeScript and test/build CI prior to staging rollout.
