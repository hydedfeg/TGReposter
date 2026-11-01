import { getPostgresPool } from "../utils/postgresPool";
import {
  isBillingWorkerEnabled,
  runBillingOperationsBatch,
  type BillingBatchResult
} from "./billingOperationsWorker";

const LOCK_NAME = "tgreposter:commercial-billing-operations";
export const DEFAULT_BILLING_WORKER_INTERVAL_MS = 60_000;
export const MIN_BILLING_WORKER_INTERVAL_MS = 30_000;

type Env = Record<string, string | undefined>;

interface TimerHandle { unref?: () => unknown; }
interface BillingLockedRun {
  acquired: boolean;
  report?: BillingBatchResult;
}

export interface BillingSchedulerDependencies {
  env?: Env;
  runLocked?: () => Promise<BillingLockedRun>;
  setIntervalFn?: (fn: () => void, ms: number) => TimerHandle;
  clearIntervalFn?: (timer: TimerHandle) => void;
  logger?: Pick<Console, "info" | "warn" | "error">;
}

export function parseBillingWorkerIntervalMs(value?: string): number {
  const raw = value?.trim();
  const intervalMs = !raw ? DEFAULT_BILLING_WORKER_INTERVAL_MS : Number(raw);
  if (!Number.isSafeInteger(intervalMs)
    || intervalMs < MIN_BILLING_WORKER_INTERVAL_MS
    || intervalMs > 24 * 60 * 60 * 1000) {
    throw new Error(
      "TGREPOSTER_BILLING_WORKER_INTERVAL_MS must be an integer between 30000 and 86400000."
    );
  }
  return intervalMs;
}

/** Global advisory lock ensures only one Railway instance runs billing jobs
 * per interval. Child services also take owner locks for atomic execution.
 */
export async function runBillingOperationsWithAdvisoryLock(
  env: Env = process.env
): Promise<BillingLockedRun> {
  if (!isBillingWorkerEnabled(env)) return { acquired: false };
  if (!env.DATABASE_URL?.trim()) {
    throw new Error("Commercial billing worker requires DATABASE_URL.");
  }
  const client = await getPostgresPool().connect();
  let acquired = false;
  try {
    const { rows } = await client.query(
      "select pg_try_advisory_lock(hashtext($1)::bigint) as acquired",
      [LOCK_NAME]
    );
    acquired = rows[0]?.acquired === true;
    if (!acquired) return { acquired: false };
    return {
      acquired: true,
      report: await runBillingOperationsBatch({ env })
    };
  } finally {
    if (acquired) {
      try {
        await client.query(
          "select pg_advisory_unlock(hashtext($1)::bigint)",
          [LOCK_NAME]
        );
      } catch (error) {
        // Session release also frees the advisory lock on disconnected clients.
        console.error("Commercial billing lock release failed:", {
          code: (error as any)?.code
        });
      }
    }
    client.release();
  }
}

export function startBillingOperationsScheduler(
  dependencies: BillingSchedulerDependencies = {}
): () => void {
  const env = dependencies.env ?? process.env;
  const logger = dependencies.logger ?? console;

  if (!isBillingWorkerEnabled(env)) return () => {};
  if (!env.DATABASE_URL?.trim()) {
    logger.warn("Commercial billing scheduler disabled: DATABASE_URL missing.");
    return () => {};
  }

  let intervalMs: number;
  try {
    intervalMs = parseBillingWorkerIntervalMs(
      env.TGREPOSTER_BILLING_WORKER_INTERVAL_MS
    );
  } catch (error) {
    logger.error("Commercial billing scheduler interval invalid:", {
      message: error instanceof Error ? error.message : "Invalid interval"
    });
    return () => {};
  }

  const run = dependencies.runLocked ??
    (() => runBillingOperationsWithAdvisoryLock(env));
  const setEvery = dependencies.setIntervalFn ??
    ((fn, ms) => setInterval(fn, ms) as unknown as TimerHandle);
  const clearEvery = dependencies.clearIntervalFn ??
    ((timer) => clearInterval(timer as ReturnType<typeof setInterval>));

  let stopped = false;
  let running = false;

  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const result = await run();
      if (!result.acquired || !result.report?.enabled) return;
      const report = result.report;
      const failures = report.failureCodes;
      if (failures.length) {
        logger.warn("Commercial billing batch has unresolved items.", {
          stages: report.stages,
          failureCodes: failures.slice(0, 10),
          additionalFailures: Math.max(0, failures.length - 10)
        });
      } else if (Object.values(report.stages).some(stage => stage.completed > 0)) {
        logger.info("Commercial billing batch completed.", { stages: report.stages });
      }
    } catch (error) {
      logger.error("Commercial billing batch failed.", {
        code: (error as any)?.code ?? "UNEXPECTED_ERROR"
      });
    } finally {
      running = false;
    }
  };

  const timer = setEvery(() => { void tick(); }, intervalMs);
  timer.unref?.();
  void tick(); // Safe: feature-gated and singleton-locked.
  logger.info("Commercial billing operations scheduler enabled.", { intervalMs });
  return () => {
    if (stopped) return;
    stopped = true;
    clearEvery(timer);
  };
}
