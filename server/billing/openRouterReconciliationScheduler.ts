import { getPostgresPool } from "../utils/postgresPool";
import {
  reconcilePendingOpenRouterUsage,
  type ReconciliationReport
} from "./openRouterReconciliation";

/**
 * Internal-only OpenRouter reconciliation polling. It NEVER opens a customer
 * route, creates a new provider generation or releases an uncertain hold.
 * Disabled until a separately authorized, explicit launch switch is set.
 */
const ADVISORY_LOCK_NAME = "tgreposter:commercial-ai-reconciliation";
export const DEFAULT_AI_RECONCILIATION_INTERVAL_MS = 15 * 60_000;
export const MIN_AI_RECONCILIATION_INTERVAL_MS = 15 * 60_000;
export const DEFAULT_AI_RECONCILIATION_BATCH_SIZE = 10;
export const MAX_AI_RECONCILIATION_BATCH_SIZE = 20;

type Env = Record<string,string | undefined>;
interface TimerHandle { unref?: () => unknown; }
export interface AiReconciliationLockedRun {
  acquired: boolean;
  report?: ReconciliationReport;
}

export interface AiReconciliationSchedulerDependencies {
  env?: Env;
  runLocked?: () => Promise<AiReconciliationLockedRun>;
  setIntervalFn?: (callback: () => void, ms: number) => TimerHandle;
  clearIntervalFn?: (timer: TimerHandle) => void;
  logger?: Pick<Console,"info" | "warn" | "error">;
}

export function isAiReconciliationSchedulerEnabled(env: Env = process.env): boolean {
  return env.TGREPOSTER_AI_RECONCILIATION_ENABLED === "true"
    && env.TGREPOSTER_COMMERCIAL_AI_ENABLED === "true"
    && Boolean(env.DATABASE_URL?.trim())
    && Boolean(env.TGREPOSTER_OPENROUTER_API_KEY?.trim());
}

export function aiReconciliationInterval(raw?: string): number {
  const value = raw?.trim()
    ? Number(raw.trim()) : DEFAULT_AI_RECONCILIATION_INTERVAL_MS;
  if (!Number.isSafeInteger(value)
      || value < MIN_AI_RECONCILIATION_INTERVAL_MS
      || value > 24 * 60 * 60_000) {
    throw new Error("Invalid AI reconciliation interval.");
  }
  return value;
}

export function aiReconciliationBatchSize(raw?: string): number {
  const value = raw?.trim()
    ? Number(raw.trim()) : DEFAULT_AI_RECONCILIATION_BATCH_SIZE;
  if (!Number.isSafeInteger(value)
      || value < 1 || value > MAX_AI_RECONCILIATION_BATCH_SIZE) {
    throw new Error("Invalid AI reconciliation batch size.");
  }
  return value;
}

/**
 * Session-level PostgreSQL advisory lock is held on the same connection until
 * the iteration completes. Other Railway replicas cannot reconcile in parallel.
 * The ledger settlement itself remains owner-locked and idempotent.
 */
export async function runAiReconciliationWithAdvisoryLock(
  env: Env = process.env,
  batchSize = DEFAULT_AI_RECONCILIATION_BATCH_SIZE
): Promise<AiReconciliationLockedRun> {
  if (!isAiReconciliationSchedulerEnabled(env)) return {acquired:false};
  if (!Number.isSafeInteger(batchSize) || batchSize < 1
      || batchSize > MAX_AI_RECONCILIATION_BATCH_SIZE) {
    throw new Error("Invalid AI reconciliation batch size.");
  }
  const client = await getPostgresPool().connect();
  let acquired = false;
  try {
    const {rows} = await client.query(
      "select pg_try_advisory_lock(hashtext($1)::bigint) as acquired",
      [ADVISORY_LOCK_NAME]
    );
    acquired = rows[0]?.acquired === true;
    if (!acquired) return {acquired:false};
    return {
      acquired:true,
      report:await reconcilePendingOpenRouterUsage({
        env,
        apiKey:env.TGREPOSTER_OPENROUTER_API_KEY,
        limit:batchSize
      })
    };
  } finally {
    if (acquired) {
      try {
        await client.query(
          "select pg_advisory_unlock(hashtext($1)::bigint)",
          [ADVISORY_LOCK_NAME]
        );
      } catch {
        // Connection release frees this session-level lock on disconnect.
        // Never log credentials or customer/provider generation metadata.
        console.error("AI reconciliation advisory unlock failed.");
      }
    }
    client.release();
  }
}

export function startAiReconciliationScheduler(
  deps: AiReconciliationSchedulerDependencies = {}
): () => void {
  const env = deps.env ?? process.env;
  if (!isAiReconciliationSchedulerEnabled(env)) return () => {};
  const logger = deps.logger ?? console;
  let interval: number;
  let size: number;
  try {
    interval = aiReconciliationInterval(
      env.TGREPOSTER_AI_RECONCILIATION_INTERVAL_MS
    );
    size = aiReconciliationBatchSize(
      env.TGREPOSTER_AI_RECONCILIATION_BATCH_SIZE
    );
  } catch {
    logger.error("AI reconciliation scheduler disabled: invalid limits.");
    return () => {};
  }

  const run = deps.runLocked ??
    (() => runAiReconciliationWithAdvisoryLock(env,size));
  const every = deps.setIntervalFn ??
    ((callback,ms) => setInterval(callback,ms) as unknown as TimerHandle);
  const clear = deps.clearIntervalFn ??
    (timer => clearInterval(timer as ReturnType<typeof setInterval>));
  let stopped = false;
  let running = false;
  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const {acquired,report} = await run();
      if (!acquired || !report) return;
      if (report.unresolved > 0) {
        logger.warn("AI reconciliation has unresolved requests.", {
          checked:report.checked,
          settled:report.settled,
          unresolved:report.unresolved
        });
      } else if (report.checked > 0) {
        logger.info("AI reconciliation iteration completed.", {
          checked:report.checked,settled:report.settled
        });
      }
    } catch (error) {
      const code = (error as any)?.code;
      logger.error("AI reconciliation iteration failed.", {
        code:typeof code === "string" && /^[A-Z0-9_]{1,64}$/.test(code)
          ? code : "RECONCILIATION_FAILED"
      });
    } finally {
      running = false;
    }
  };

  const timer = every(() => {void tick();},interval);
  timer.unref?.();
  void tick();
  logger.info("AI reconciliation scheduler enabled.", {
    intervalMs:interval,batchSize:size
  });
  return () => {
    if (stopped) return;
    stopped = true;
    clear(timer);
  };
}
