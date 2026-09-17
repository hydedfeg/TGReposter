# Backend tenant-isolation verification

Run the focused suite:

```sh
node --import tsx --test tests/backendIsolation.integration.test.ts
```

It is also included in `npm test` and the production build's test gate.
The local API port 3000 must be free. Tests execute sequentially.

## Coverage and limits

The test runs the production Express routes, authentication middleware, services,
and repositories against an isolated PGlite PostgreSQL engine through the real
`pg` driver. Alice is a super-admin; Bob is an admin. Both authenticate through
the application's login route. The upstream Supabase Auth service is mocked,
including malicious user metadata, so these tests do not verify hosted JWT
issuance or cryptographic validation by Supabase.

The suite applies repository migrations, with test-only stand-ins for managed
Auth tables/functions, Vault and Cron. It omits pg_net extension installation;
scheduled commands are recorded, never executed. Fake Vault credentials are
plaintext: this fixture does not test Vault encryption. Telegram, public preview
pages, and OpenRouter are mocked; unexpected outbound requests fail closed.
Inherited database URLs and provider credentials are not passed to the server.
PGlite's multiplexed connections do not prove native PostgreSQL concurrency or
production load behavior.

A clean hosted staging run exposed that `curator_settings` existed in production
but was absent from the source-controlled baseline, and that `pg_cron` had been
enabled outside migration history. The initial migration now defines and safely
seeds the compatibility table and installs the scheduler extension according to
Supabase's documented SQL setup. The test fixture no longer creates the table,
so clean migration runs exercise the repository definition directly.

Checks include:

- Missing/forged sessions and database-owned role decisions.
- Independent sources, filters, AI preferences, and same-ID collected posts.
- Inbox edits and rejection of foreign post IDs.
- Owner-specific destination IDs, bot tokens and reposting outcomes.
- Campaign, bot, target and campaign-post access in both directions, including
  super-admin attempts to access another user's campaign.
- Denied AI, launch and retry requests producing no external calls.
- Successful owner-authorized AI and delivery with isolated delivery history.
- Composite foreign-key rejection of mismatched inserts and parent updates.
- Direct database access restrictions and profile RLS for the authenticated role.
- Immediate API denial after a profile is deactivated.

## Environment-specific scheduler endpoint

`supabase/migrations/20260915125102_configure_environment_specific_inbox_cron_url.sql`
reschedules the five-minute Content Inbox import using the optional
`tgreposter_app_url` Supabase Vault secret. The value is normalized by trimming
whitespace and trailing slashes before `/api/fetch-posts` is appended.

Set this Vault value independently in every non-production environment. Do not
commit an environment URL or cron credential to the repository. When the URL
secret is absent or empty, the job retains `https://api.tgreposter.com` as the
production fallback. The separate `tgreposter_cron_secret` Vault value continues
to authenticate scheduled requests.

`cron.job_run_details` confirms only that `pg_cron` queued the SQL command. Use
the matching request ID in `net._http_response` to verify the actual HTTP status
and response body; a queued request can still return `401` or another error.

## Owner-specific 24-hour retention

The hourly `tgreposter-inbox-cleanup` job removes source posts older than 24
hours only when the same owner has neither an `approved`/`posted` inbox state
nor a campaign link. Both retention subqueries match `owner_principal` and the
Telegram post ID, so one user's workflow state cannot preserve or delete another
user's copy of the same Telegram post.

The integration suite executes the registered cron command inside a rolled-back
transaction. Its two-user matrix verifies approved, posted, campaign-linked,
recent, and expired cases, including cascading removal of pending/archived inbox
state. Hosted staging was checked with the same rollback-only matrix; no
synthetic post, inbox item, campaign, or campaign link was committed.

## Approval-gated personal publishing

The personal reposting endpoint resolves the authenticated user's Content Inbox
post before loading destinations or Vault credentials. A missing owner-scoped
post returns `404`; `pending`, `archived`, and already `posted` posts return
`409 POST_NOT_APPROVED`. Only an `approved` post can reach Telegram.

After approval, the endpoint loads only that owner's enabled destination IDs and
hashed Vault credential name. Foreign or disabled target IDs are rejected before
Telegram is called. The integration suite proves that a pending Bob post causes
no outbound request, then approves and publishes it with Bob's bot and target
while Alice's same-ID post, destination status, and inbox state remain unchanged.

Hosted staging currently has one enabled destination and one pending post for
each test account, but neither account has a destination bot credential or an
approved post. No real Telegram message was sent during this verification.

## Packaged database correction — not deployed

The legacy promotion owner-derivation triggers overwrite an explicitly supplied
owner with the parent's owner. Reproduction before the patch: an attempt inserted
with Alice's owner and Bob's delivery was silently attributed to Bob rather than
rejected. The API checks passed; this is a database defense-in-depth gap, not a
demonstrated exploit through the tested API routes.

`supabase/migrations/20260910133829_reject_implicit_promotion_owner_reassignment.sql` removes the
four legacy triggers and their functions, without changing data, grants, RLS or
foreign keys. The current repositories already supply the authenticated owner.
After this change, missing owners fail NOT NULL and mismatched references fail
the existing composite foreign keys.

The focused suite now loads this correction through the normal migration loop;
there is no separately applied draft SQL. The migration was packaged manually
with user approval because the Supabase CLI download was blocked by network
approval controls. Existing migration files were not rewritten.

**A passing build verifies the local migration sequence, not a production
deployment or hosted Supabase migration-history reconciliation.**

Before deployment:

1. Confirm the owner-aware runtime and both 20260905 finalization migrations are
   present, and reconcile local/remote migration history with the CLI when available.
2. Review the migration on staging with hosted Supabase Auth and native
   PostgreSQL, including security advisors and the two-user isolation checks.
   The local tests do not replace that final verification.
3. Apply the new migration to production only with deployment authorization.

The SQL uses a short lock timeout and no CASCADE. Unexpected dependencies stop
the patch for review. Reverting this patch would restore the insecure implicit
reassignment behavior; do not automatically restore the old triggers on rollback.
