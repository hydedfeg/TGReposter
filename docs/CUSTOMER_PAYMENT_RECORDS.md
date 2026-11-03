# Customer payment records

The Billing & Usage purchase history offers a JSON payment record for a fulfilled subscription or AI top-up order. It is a purchase/payment record, not a tax invoice, refund confirmation or a new financial transaction. Merchant tax invoices remain a separate release requirement.

## Read-only verification

`GET /api/billing/orders/:type/:id/payment-record` accepts only `subscription` or `topup` and a UUID. It derives the owner exclusively from the authenticated session and rejects query parameters. A missing or foreign order returns the same generic 404. It never grants credits, creates orders, changes status, publishes plans or sends messages.

The loader uses one repeatable-read, read-only database transaction. Download eligibility requires a fulfilled order; a paid invoice; the order's original quoted USDT amount matching the invoice's requested amount; no competing order of the other product type attached to that invoice; owner-matched fulfillment evidence (subscription term or purchased-unit grant); and a matching confirmed transfer meeting the configured network finality threshold. A configuration or evidence failure prevents download.

The JSON retains the order's original EUR minor-unit price, product identifier, exact decimal-string USDT amount (including the payable suffix), network, and recorded creation/payment/fulfillment dates. It does not look up mutable catalog display names/prices. It excludes owner principals, invoice IDs, wallet addresses, transaction hashes, secrets and credentials. The download has private/no-store and nosniff headers. The browser adds the notice in the selected EN/RU/AR/FA interface language; stable machine values remain untranslated.

## Verification boundary

Database tests cover foreign owners, invalid identities, wrong/underfinalized transfers, inconsistent quote amounts, missing fulfillment, wrong-owner AI grants and invoice reuse. Mounted React tests cover all four locales, exact amounts, response/order mismatches, duplicate clicks and responses after account unmount. Route tests cover session attribution, query spoofing, anonymous denial, private caching, attachment headers and error redaction. The live staging anonymous/forged-token preflight includes both product types.

No migration or new feature flag is required. No real customer record is fabricated for testing. An actual fulfilled staging customer order is still required to certify the positive deployed download path; synthetic tests are not a real purchase or a tax-compliance signoff.
