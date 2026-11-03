# Customer subscription management

The Billing & Usage page offers end-of-paid-term cancellation and withdrawal of a scheduled cancellation for an active paid subscription. It uses the existing serialized, owner-scoped lifecycle service; it does not create charges, refunds, new subscriptions, or immediate entitlement reductions.

## Availability and request flow

- Authenticated `GET /api/billing/subscription/management-status` returns only `{ enabled: boolean }`, with private/no-store headers. Both a configured database and `TGREPOSTER_SUBSCRIPTION_MANAGEMENT_ENABLED=true` are required. Request parameters cannot enable management.
- The UI hides mutation controls unless this capability is explicitly true and the billing overview contains an active paid subscription with a valid term end.
- Both cancellation and reversal require an inline confirmation. `POST /api/billing/subscription/cancellation` sends only the desired `cancelAtPeriodEnd` boolean. The server derives the owner from the session and rechecks availability and financial eligibility.
- A successful mutation reloads the authoritative overview. Pending payments/prepaid terms require review. An interrupted response is treated as an uncertain result and asks the customer to refresh, never claiming the request failed without changing anything.
- Controls are remounted when the authenticated token changes. Unmount aborts requests; late responses cannot refresh another account's billing view. A synchronous request guard prevents duplicate in-flight mutations.
- EN/RU/AR/FA include the confirmation, policy and error messages. Wrapping button groups and logical layout support RTL and narrow viewports.

## Verification and release boundary

Mounted React tests exercise all four locales, explicit confirmation, cancellation/reversal payloads, server gating, financial conflict, interrupted responses, duplicate clicks, and responses after unmount. Route tests verify authentication, private caching, and server-controlled capability. The staging anonymous/forged-token preflight includes the capability route.

This change does not enable the environment gate. Deployed customer acceptance still requires genuine staging test sessions. It does not clear backup/restore, financial fulfillment, quota rollout, refund policy, tax invoicing, or production launch gates. It does not implement automatic USDT debits or executable plan upgrades/downgrades.

Browser layout acceptance was not completed in the implementation environment: Chromium was absent and its download failed. DOM behavior tests are not a substitute for browser rendering or a real phone check.
