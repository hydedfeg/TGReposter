# Staging live anonymous API security smoke

**Scope:** credential-free staging-only read authorization check; **not** production and **not** proof of real two-user acceptance.

Workflow: `.github/workflows/staging-anonymous-api-smoke.yml`, branch `feat/commercial-staging-integration`. It is triggered when selected auth-sensitive route, acceptance script or workflow files are pushed to the staging branch. **While this workflow file is not yet on the repository's default branch, GitHub's `Run workflow` button may not be available.** After a Railway deployment settles, re-run an existing completed successful smoke execution instead: GitHub **Actions → Staging anonymous API security smoke → select a run → Re-run jobs → Re-run all jobs** (subject to GitHub's re-run retention window). This re-run probes the then-live staging API; it does not attest the deployed source SHA. Once the workflow exists on the default branch, `workflow_dispatch` can also be used to select the staging branch.

The workflow installs the locked dependencies on Node 22.23.0, refuses to run if staging test-account credentials or privileged database environment variables are present, and invokes:

```sh
TGREPOSTER_STAGING_BASE_URL=https://tgreposter-staging-production.up.railway.app \
  npx tsx scripts/verifyStagingBillingAuth.ts --preflight
```

The script makes a bounded number of **GET** requests only against the exact staging origin, checks that private billing, checkout, channels, promotion targets/bots/campaigns, administration, settings and crypto monitoring routes reject anonymous requests with HTTP 401, and checks forged bearer tokens on selected routes. It never sends customer login passwords, genuine JWTs, Telegram messages or payment orders. Redirect responses fail closed.

## Interpretation

- **PASS**: Those live API routes denied the tested anonymous and invalid-token GET requests at the time of the run. The runner must have network reachability, and the staging deployment must already have the relevant routes. A workflow triggered by a push may inspect the *previous* deployment while Railway deploys the new commit; therefore rerun it manually after deploying the target SHA before reporting a release-ready HTTP smoke.
- **FAIL**: Treat a non-401, redirect, network/timeout, or unexpected response as a **release-blocking signal** until explained. In particular, do **not** infer a security regression from an unreachable staging site without checking Railway service and logs.
- **NOT COVERED**: valid Supabase login, owner-to-owner data isolation with two real staging accounts, write-route authorization, custom-cookie/CSRF behavior, DB backup/restoration, successful commercial payment fulfillment or production security.

Use issue [#79](https://github.com/hydedfeg/TGReposter/issues/79) for real two-account login acceptance and issue [#78](https://github.com/hydedfeg/TGReposter/issues/78) for authorized isolated restore. The public workflow must never be extended to use passwords, sessions, service-role secrets or customer databases. No feature flag, plan publication or production deployment is authorized by a successful smoke.
