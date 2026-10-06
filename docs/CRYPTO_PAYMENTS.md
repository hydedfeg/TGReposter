# Crypto Payment Infrastructure

## Scope

TGReposter's crypto payment layer is a plan-agnostic, non-custodial payment
detection system. It is responsible for receiving metadata, observing supported
USDT networks, matching transfers to payment invoices, and recording an
idempotent audit trail.

Pricing, subscriptions, entitlements, checkout presentation, and sales plans
are intentionally outside this module.

## Supported networks

The infrastructure currently supports:

- USD₮ on Ethereum using Tether's canonical ERC-20 contract
- USD₮ on TON using Tether's canonical Jetton master
- the widely used BNB Smart Chain USDT representation at the allow-listed BSC contract

BSC and Ethereum share the same ERC-20 JSON-RPC adapter. TON uses a TON
Center-compatible API v3 Jetton indexer.

The asset identifiers are pinned in code. Configuration may repeat the
identifier for clarity, but a different contract/master is rejected. This
prevents a lookalike token using the USDT symbol from being credited.

BSC provenance is intentionally reported separately from Tether-issued
Ethereum/TON USD₮ in the super-admin runtime status.

## Security boundary

TGReposter must never store or request:

- wallet private keys
- seed phrases or mnemonics
- signing keys
- wallet passwords
- withdrawal credentials

The runtime requires only read-side payment metadata:

- receiving address
- exact token contract / Jetton master identifier
- blockchain RPC or indexer URL
- optional read-only provider API key
- confirmation/finality configuration

Payment network configuration is server-side only.

## Database

The payment database layer contains:

- `crypto_payment_invoices`
- `crypto_payment_transactions`
- `crypto_payment_events`
- `crypto_payment_network_state`

Invoice, transaction, and event rows are owner-scoped. Chain scanner state is
global to the configured merchant payment identity.

All payment tables have RLS enabled and direct `anon` / `authenticated`
table privileges revoked. The Railway backend is the authority for payment
writes.

A chain event is uniquely identified by:

```text
network + transaction hash + event index
```

This prevents the same transfer from being assigned to more than one invoice.

## Invoice state

Supported invoice states are:

```text
pending
detected
confirming
paid
expired
underpaid
overpaid
failed
cancelled
```

Terminal states do not transition back to an active state.

Invoice state changes are serialized with a database row lock.

## Invoice amount reservation

The payment layer can create plan-neutral invoices from a nominal USDT amount.

For shared merchant addresses, it reserves a small unique suffix in the final
six USDT decimal places. With the default four-digit discriminator, a nominal
amount such as `20.00` may become `20.003827`.

Allocation uses integer token base units only; JavaScript floating-point money
math is never used.

Reservations are enforced by a database uniqueness constraint across:

```text
network + receiving address + token identifier + expected amount
```

A reservation stays quarantined beyond invoice expiry for a configurable reuse
delay (24 hours by default), which reduces the risk that a late transfer is
mistaken for a newer invoice.

The pricing layer will eventually supply the nominal amount and invoice expiry.
It will not allocate suffixes or perform blockchain matching itself.

## Transfer matching

The current matcher requires:

1. the configured network,
2. the configured receiving address,
3. the configured token contract / Jetton master,
4. the exact expected token amount,
5. a blockchain timestamp within the invoice lifetime.

Already-assigned transfers are looked up before matching new invoices, so a
historical transfer cannot be replayed against another account.

If multiple open invoices would match the same unassigned transfer, the watcher
marks the observation as ambiguous and does not credit any invoice.

## EVM watcher

The EVM watcher uses standard JSON-RPC only.

Before scanning, it verifies:

- BSC reports chain ID 56;
- Ethereum reports chain ID 1;
- the configured token identifier matches the network's allow-listed USDT asset;
- the configured token identifier contains deployed contract bytecode;
- token decimals are readable from `decimals()`.

Incoming ERC-20 `Transfer` logs are filtered by both the token contract and
merchant receiving address.

The scan cursor intentionally retains blocks that have not reached the required
confirmation count. Those blocks are rescanned until transfers become final
enough for the configured network.

## TON watcher

The TON watcher uses TON Center-compatible API v3 endpoints:

- `/api/v3/jetton/masters`
- `/api/v3/jetton/transfers`

It filters incoming Jetton transfers by merchant owner address and the
allow-listed Tether USD₮ Jetton master. Aborted transactions are rejected.

Jetton decimals are read from master metadata rather than inferred from the
display symbol.

The TON scanner stores a timestamp cursor with a short overlap window so
backend restarts and ordinary indexer lag do not create a blind boundary.

## Scanner scheduling

The Railway backend starts the payment scheduler only when:

- `CRYPTO_PAYMENTS_ENABLED=true`;
- at least one payment network is enabled and fully configured;
- `DATABASE_URL` is available.

The default scan interval is 60 seconds. The minimum allowed interval is 15
seconds.

BSC and Ethereum confirmation depth must be configured explicitly when those
networks are enabled. The infrastructure intentionally has no one-confirmation
fallback for EVM payments. TON's indexed transfer adapter requires a finalized
observation and therefore uses a confirmation value of 1.

Every automatic or manual scan uses the same PostgreSQL advisory lock. If two
Railway instances are running, only one may execute a chain scan at a time.

The lock is released in a `finally` block. Closing the PostgreSQL session also
releases the session-level lock if an explicit unlock fails.

## Network request safety

Every blockchain HTTP request has a bounded timeout. The default is 10 seconds.

Scan ranges are bounded:

- EVM scans have a maximum block window.
- TON scans have a maximum indexed-transfer batch.

Provider failures are isolated by network; a failure on one enabled network
does not prevent another network from being scanned.

## Backend operations API

Infrastructure operations are mounted under:

```text
/api/crypto-payments
```

They require an authenticated super-admin session.

Available operations:

```text
GET  /api/crypto-payments/status
POST /api/crypto-payments/scan
POST /api/crypto-payments/invoices
GET  /api/crypto-payments/invoices/:id
POST /api/crypto-payments/invoices/:id/cancel
```

Invoice operations are also super-admin-only at this stage. They exist for
infrastructure testing and are not yet a customer checkout API.

The status response exposes capabilities only. It never returns RPC URLs,
provider API keys, merchant receiving addresses, or token identifiers.

## Environment variables

Global:

```text
CRYPTO_PAYMENTS_ENABLED
CRYPTO_PAYMENT_SCAN_INTERVAL_MS
CRYPTO_PAYMENT_REQUEST_TIMEOUT_MS
CRYPTO_PAYMENT_AMOUNT_DISCRIMINATOR_DIGITS
CRYPTO_PAYMENT_AMOUNT_REUSE_DELAY_MS
```

Per network:

```text
CRYPTO_USDT_<NETWORK>_ENABLED
CRYPTO_USDT_<NETWORK>_RPC_URL
CRYPTO_USDT_<NETWORK>_RECEIVING_ADDRESS
CRYPTO_USDT_<NETWORK>_TOKEN_IDENTIFIER
CRYPTO_USDT_<NETWORK>_CONFIRMATIONS
CRYPTO_USDT_<NETWORK>_MAX_BLOCKS_PER_SCAN
```

TON additionally supports:

```text
CRYPTO_USDT_TON_API_KEY
```

All networks are disabled by default.

## Deployment state

The schema has been exercised only in the TGReposter staging Supabase project.

Production payment infrastructure must remain disabled until:

1. merchant receiving addresses are selected;
2. exact official USDT token identifiers are verified for each enabled network;
3. RPC/indexer providers are selected;
4. environment secrets are configured in Railway;
5. a read-only live-chain smoke test passes;
6. invoice creation and later sales-plan integration are approved.

## Future integration boundary

The future pricing/subscription layer should call the payment infrastructure
with a user owner principal, network, amount, and invoice lifetime.

The payment layer must not contain product-tier rules. Conversely, product-tier
logic must not implement blockchain verification itself.
