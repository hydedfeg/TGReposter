import { getPostgresPool } from "../utils/postgresPool";
import {
  getCryptoPaymentRuntimeStatus,
  scanConfiguredCryptoPayments,
  type CryptoPaymentRuntimeResult,
} from "./paymentRuntime";
import {
  maintainCryptoPaymentInvoices,
  type CryptoPaymentMaintenanceResult,
} from "./paymentMaintenance";

const PAYMENT_SCAN_LOCK_NAME = "tgreposter:crypto-payment-scan";
export const DEFAULT_CRYPTO_PAYMENT_SCAN_INTERVAL_MS = 60_000;
export const MIN_CRYPTO_PAYMENT_SCAN_INTERVAL_MS = 15_000;

type Environment = Record<string, string | undefined>;

interface SchedulerTimer {
  unref?: () => unknown;
}

interface CryptoPaymentSchedulerDependencies {
  env?: Environment;
  runLockedScan?: () => Promise<{
    acquired: boolean;
    result?: CryptoPaymentRuntimeResult;
    maintenance?: CryptoPaymentMaintenanceResult;
  }>;
  setIntervalFn?: (
    callback: () => void,
    intervalMs: number
  ) => SchedulerTimer;
  clearIntervalFn?: (timer: SchedulerTimer) => void;
  logger?: Pick<Console, "info" | "warn" | "error">;
}

export function parseCryptoPaymentScanIntervalMs(
  value?: string
): number {
  const raw = value?.trim();
  if (!raw) {
    return DEFAULT_CRYPTO_PAYMENT_SCAN_INTERVAL_MS;
  }

  const intervalMs = Number.parseInt(raw, 10);
  if (
    !Number.isSafeInteger(intervalMs) ||
    intervalMs < MIN_CRYPTO_PAYMENT_SCAN_INTERVAL_MS
  ) {
    throw new Error(
      `CRYPTO_PAYMENT_SCAN_INTERVAL_MS must be an integer >= ${MIN_CRYPTO_PAYMENT_SCAN_INTERVAL_MS}.`
    );
  }

  return intervalMs;
}

export async function runCryptoPaymentScanWithAdvisoryLock(
  env: Environment = process.env
): Promise<{
  acquired: boolean;
  result?: CryptoPaymentRuntimeResult;
  maintenance?: CryptoPaymentMaintenanceResult;
}> {
  if (!env.DATABASE_URL?.trim()) {
    throw new Error(
      "Automatic crypto payment scanning requires DATABASE_URL."
    );
  }

  const client = await getPostgresPool().connect();
  let acquired = false;

  try {
    const lockResult = await client.query(
      `
        select pg_try_advisory_lock(
          hashtext($1)::bigint
        ) as acquired
      `,
      [PAYMENT_SCAN_LOCK_NAME]
    );

    acquired = lockResult.rows[0]?.acquired === true;
    if (!acquired) {
      return { acquired: false };
    }

    const result = await scanConfiguredCryptoPayments(env);
    const maintenance = await maintainCryptoPaymentInvoices();

    return {
      acquired: true,
      result,
      maintenance,
    };
  } finally {
    if (acquired) {
      try {
        await client.query(
          `
            select pg_advisory_unlock(
              hashtext($1)::bigint
            )
          `,
          [PAYMENT_SCAN_LOCK_NAME]
        );
      } catch (error) {
        // Releasing the database session below also releases session-level locks.
        console.error("Crypto payment advisory lock release failed:", {
          name: (error as any)?.name,
          code: (error as any)?.code,
        });
      }
    }

    client.release();
  }
}

export function startCryptoPaymentScheduler(
  dependencies: CryptoPaymentSchedulerDependencies = {}
): () => void {
  const env = dependencies.env ?? process.env;
  const logger = dependencies.logger ?? console;
  const runLockedScan =
    dependencies.runLockedScan ??
    (() => runCryptoPaymentScanWithAdvisoryLock(env));
  const setIntervalFn =
    dependencies.setIntervalFn ??
    ((callback, intervalMs) =>
      setInterval(callback, intervalMs) as unknown as SchedulerTimer);
  const clearIntervalFn =
    dependencies.clearIntervalFn ??
    ((timer) => clearInterval(timer as ReturnType<typeof setInterval>));

  let runtimeStatus;
  try {
    runtimeStatus = getCryptoPaymentRuntimeStatus(env);
  } catch (error: any) {
    logger.error("Crypto payment scheduler configuration is invalid:", {
      name: error?.name,
      message: error?.message,
    });
    return () => {};
  }

  if (!runtimeStatus.enabled) {
    return () => {};
  }

  if (!env.DATABASE_URL?.trim()) {
    logger.warn(
      "Crypto payment scheduler is disabled because DATABASE_URL is not configured."
    );
    return () => {};
  }

  let intervalMs: number;
  try {
    intervalMs = parseCryptoPaymentScanIntervalMs(
      env.CRYPTO_PAYMENT_SCAN_INTERVAL_MS
    );
  } catch (error: any) {
    logger.error("Crypto payment scheduler interval is invalid:", {
      name: error?.name,
      message: error?.message,
    });
    return () => {};
  }

  let stopped = false;
  let running = false;

  const tick = async () => {
    if (stopped || running) {
      return;
    }

    running = true;
    try {
      const execution = await runLockedScan();
      if (!execution.acquired) {
        return;
      }

      const failures =
        execution.result?.networks.filter((network) => !network.ok) ?? [];
      if (failures.length > 0) {
        logger.warn("Crypto payment scan completed with network failures:", {
          networks: failures.map((failure) => failure.network),
        });
      }

      if (
        execution.maintenance &&
        (execution.maintenance.expiredInvoices > 0 ||
          execution.maintenance.releasedReservations > 0)
      ) {
        logger.info("Crypto payment lifecycle maintenance completed.", {
          expiredInvoices: execution.maintenance.expiredInvoices,
          releasedReservations:
            execution.maintenance.releasedReservations,
        });
      }
    } catch (error: any) {
      logger.error("Crypto payment scheduled scan failed:", {
        name: error?.name,
        code: error?.code,
      });
    } finally {
      running = false;
    }
  };

  const timer = setIntervalFn(() => {
    void tick();
  }, intervalMs);
  timer.unref?.();

  // Run one scan on startup rather than waiting for the first interval.
  void tick();

  logger.info("Crypto payment scheduler enabled.", {
    networks: runtimeStatus.networks.map((network) => network.id),
    intervalMs,
  });

  return () => {
    if (stopped) {
      return;
    }
    stopped = true;
    clearIntervalFn(timer);
  };
}
