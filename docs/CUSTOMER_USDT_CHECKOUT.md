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
