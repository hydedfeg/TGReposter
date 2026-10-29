# Private staging — real two-account tenant isolation acceptance

**Status: NOT EXECUTED WITH REAL CREDENTIALS. Release issue #79 remains open.**
This document is for a trusted private operator environment, not public GitHub Actions.

Read-only staging SQL verified three confirmed Supabase Auth users with profiles. Exactly **two** of those users each own source-channel, promotion-campaign and destination rows. The third user is **not** an adequate substitute for either fixture owner; the acceptance harness now fails as *INCONCLUSIVE* on empty or overlapping source/campaign fixtures. No raw IDs, emails or personal data need to be exposed to run a positive test.

1. On a trusted private computer with restricted terminal/log access, select the **two existing confirmed staging fixture owners**. Do not create or reset accounts.
2. Supply the following variables privately (never in chat, public CI or logs):
   `TGREPOSTER_STAGING_BASE_URL=https://tgreposter-staging-production.up.railway.app`,
   `TGREPOSTER_STAGING_ALICE_EMAIL`, `TGREPOSTER_STAGING_ALICE_PASSWORD`,
   `TGREPOSTER_STAGING_BOB_EMAIL`, `TGREPOSTER_STAGING_BOB_PASSWORD`.
3. Execute `npx tsx scripts/verifyStagingBillingAuth.ts` **without** `--preflight`.
4. Require two successful Supabase-backed logins; unique account keys; both sessions' own billing, source and promotion list reads; owner override cannot alter responses; nonempty **distinct source AND campaign UUIDs** for both sessions; each own campaign detail returns 200, while using the *other* session's token against that ID returns generic 404/NOT_FOUND with no private data.
5. Only record pass/fail and counters, never account names, tokens, campaign identifiers, raw responses, passwords or post text.

The script makes no content changes, new orders, Telegram sends, blockchain transfers or database migrations. **Even PASS is read-only acceptance**: write-route authorization, cross-user workspace behavior in browsers, actual backup recovery and other release gates remain separate. When credentials are unavailable, retain **BLOCKED/UNVERIFIED** status on issue #79; a 401 anonymous preflight and read-only SQL fixtures do not substitute for this test.

Related: [release tracker #71](https://github.com/hydedfeg/TGReposter/issues/71), [backup/restore #78](https://github.com/hydedfeg/TGReposter/issues/78).
