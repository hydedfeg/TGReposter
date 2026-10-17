/** Local TON provider pacing between scheduled payment scans.
 *
 * A 429 must not block BSC/Ethereum or hold the PostgreSQL scanner advisory
 * lock while sleeping. Instead the next TON-only scan is deferred. The
 * scanner's durable database cursor remains unchanged while deferred.
 * The default instance is shared by all scans within one Node process.
 *
 * A restart resets this memory-only policy; the prior durable payment cursor
 * still provides replay protection. Multiple replicas may need persisted,
 * shared provider throttling before commercial launch.
 */
export const TON_RATE_LIMIT_BASE_MS = 60_000;
export const TON_RATE_LIMIT_MAX_MS = 15 * 60_000;

export class TonScanRateLimitBackoff {
  private failures = 0;
  private retryAtMs = 0;

  constructor(private readonly now: () => number = () => Date.now()) {}

  retryAt(): string | null {
    const now = this.now();
    return Number.isFinite(now) && this.retryAtMs > now
      ? new Date(this.retryAtMs).toISOString()
      : null;
  }

  noteRateLimited(providerHintMs: number | null = null): string {
    const now = this.now();
    if (!Number.isFinite(now) || now < 0) {
      throw new Error("Invalid TON rate-limit clock.");
    }
    this.failures = Math.min(this.failures + 1, 5);
    const exponential = Math.min(
      TON_RATE_LIMIT_MAX_MS,
      TON_RATE_LIMIT_BASE_MS * 2 ** (this.failures - 1)
    );
    const boundedHint = providerHintMs !== null &&
      Number.isFinite(providerHintMs) && providerHintMs > 0
        ? Math.min(TON_RATE_LIMIT_MAX_MS, Math.ceil(providerHintMs))
        : 0;
    const delay = Math.max(exponential, boundedHint);
    this.retryAtMs = now + delay;
    return new Date(this.retryAtMs).toISOString();
  }

  reset(): void {
    this.failures = 0;
    this.retryAtMs = 0;
  }
}
