# Customer USDT subscription checkout — first gated increment

**Branch:** `feat/customer-usdt-checkout`. **Status:** development; disabled by default.

## Browser
Authenticated users may open `/dashboard/billing/checkout` in the TGReposter app.
Billing & Usage also links to this view; an existing subscription order can be
opened again from its order history. An unavailable screen is deliberate until
checkout is separately enabled and products are published.

## API
All endpoints require an authenticated account, set `Cache-Control: private, no-store`
and derive the owner from the server session. They never accept client-supplied
owner, EUR/USDT exchange rate, payable amount or receiving address.

- `GET /api/billing/checkout/status`: published plan catalog and available
  networks; when disabled returns `enabled:false`, no sellable catalog.
- `POST /api/billing/checkout/quotes`: strict `{planId,interval}`,
  uses Kraken USDT/EUR ask and existing server-side catalog.
- `POST /api/billing/checkout/orders`: strict `{quoteId,network}`, uses
  an existing owner-specific quote to reserve a uniquely identifiable USDT
  invoice and create its subscription order.
- `GET /api/billing/checkout/orders/:id`: reads only that authenticated
  owner's order, payment status, exact USDT amount and payment instructions.
  It remains read-only even when checkout issuance is subsequently disabled.

## Safety and limits
- Requires **all** `TGREPOSTER_CUSTOMER_CHECKOUT_ENABLED=true`,
  `TGREPOSTER_SUBSCRIPTION_CHECKOUT_ENABLED=true` and
  `CRYPTO_PAYMENTS_ENABLED=true`. None were changed in this work.
- Paid products must separately be **published** in the backend catalog.
- The FX quote is valid for five minutes to *begin* checkout. Once issued,
  the invoice payment window is 45 minutes; the exchange rate is not
  recalculated mid-payment. A unique amount suffix identifies the invoice.
- A quote's reserved invoice cannot be switched to a different network
  or nominal amount on retry. Invoice/order relationships remain owner-scoped.
- The UI never treats `pending` or `confirming` as `fulfilled`. The
  preexisting verified fulfillment service and billing worker control grants.
- No user-supplied transaction hash can activate an account. Never request
  private wallet keys.
- This increment covers **subscription checkout only**. AI top-up purchase,
  payment QR code, checkout throttling, merchant legal/tax disclosures,
  refunds, detailed exception handling and independent live network acceptance
  remain future launch blockers.
- **Do not activate these flags or publish plans** without separate approval
  of merchant compliance, financial policies and authorized staging live tests.


## AI Unit top-up checkout (subsequent staging increment)

- Active top-up purchase uses `POST /api/billing/checkout/topups/quotes`
  with strictly `{packId}`; the server reads the published pack and its
  listed EUR price, not browser-supplied amounts.
- `POST /api/billing/checkout/topups/orders` accepts only
  `{quoteId,network}` and reserves a unique USDT amount by calling the
  same on-chain invoice service used for subscriptions. An owner-scoped
  five-minute quote becomes a 45-minute USDT invoice.
- `GET /api/billing/checkout/orders/:id` returns the authenticated owner's
  *subscription or top-up order*, never another owner's records. Neither
  this endpoint nor the checkout page may post credits or trust a supplied
  blockchain transaction hash. The already-implemented billing worker must
  verify the transfer and issue purchased AI Units idempotently.
- Subscription checkout now also requires
  `TGREPOSTER_BILLING_WORKER_ENABLED=true`. The additional top-up action
  requires `TGREPOSTER_COMMERCIAL_TOPUPS_ENABLED=true` and
  `TGREPOSTER_COMMERCIAL_AI_ENABLED=true`. All are disabled in staging.
- When charging is disabled, authenticated customers can still view
  **read-only planned EUR subscription prices and AI top-up packs** from the
  database. No wallet, QR code, live amount, invoice or payment action is
  rendered for prelaunch pricing.
- The prelaunch catalog is informational only and must be accompanied by a
  clear no-payment notice. Publication of plans/packs and launch approval
  are independent requirements; do not use fixture overrides in runtime.

Remaining launch blockers include merchant payment/tax/refund terms, FX
confirmation, limits and abuse prevention, QR-code verification, a staging
live-identity test, authorization for any on-chain purchase, reconciliation
exceptions and an explicit production go/no-go.
