# Staging Railway billing payment-evidence build incident

**Investigated:** October 27, 2026  
**Scope:** staging branch `feat/commercial-staging-integration` only.

## Incident

Railway staging build for commit `5f27dd75b88402035c5190655e3f3810d7d363a4` (deployment `40e7386b-7a8f-4998-a361-bdc5508acdb6`) failed during the normal `npm run build`, which runs `npm test` before bundling. Test summary: **543 passed, 1 failed**. The single reported failure was `tests/billingPaymentEvidenceAcceptance.test.ts` with a generic child test failure and no assertion message in the available Railway build logs. This is **not** evidence that payment verification accepted forged transactions.

GitHub Actions ran the exact same commit and passed **544/544 tests**. The payment evidence source is unchanged between this failed staging commit and the preceding successful deployment. Two Railway image builds overlapped in time: older commit `546be59be2bfa8983b327b694ee045909de4621b` started 2026-10-25 16:58:51 UTC, and `5f27dd7` started 17:00:00 UTC. The earlier build finished successfully at 17:08:33 UTC; the later build failed at 17:10:25 UTC. Resource contention is a **hypothesis, not a confirmed root cause**.

On October 27, a separate isolated Vercel sandbox using the failed commit successfully ran the exact payment evidence test standalone, then **10 additional repeat runs, all passing**. No real payment, external blockchain query, Telegram message, migration, or customer record was involved.

## Preserved correctness

The test still rejects wrong token, receiving address, insufficient blockchain confirmations, incorrect amount, cross-owner transaction proof, duplicate paid terms and wrong-account lookups. It verifies a synthetic 120-confirmation BSC payment and grants a subscription at most once. Do **not** weaken the assertions or replace configured finality with a one-confirmation fallback.

## Safe disposition

- Leave the already successful Railway staging deployment live while rerunning the latest commit in a **single** staging build. This documentation-only commit intentionally causes a fresh build without modifying payment runtime logic.
- Require the exact-head Railway image build to pass **all 544 tests**, the GitHub CI job to pass, and 1/1 healthy staging replicas before marking the release candidate deployed.
- If a repeated generic test-child failure appears, capture the build job's process exit/signal and memory metrics, check resource contention and prioritize improving test-runner diagnostic reporting. Do not add blanket retries or skip payment tests as a workaround.
- Do not run a live crypto transfer, activate checkout, replay historical staging migrations, change production, or share secrets.

## Other release gates

The synthetic PostgreSQL backup/restore workflow passed but is **not** a verified restore of the real staging Supabase database. An authorized, isolated live staging backup/restore and two genuine staging Supabase Auth logins remain separate prerequisites to commercial launch. See `docs/STAGING_BACKUP_RESTORE_RELEASE_GATE.md`.