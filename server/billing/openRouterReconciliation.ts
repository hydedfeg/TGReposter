/**
 * OpenRouter generation reconciliation for requests with unknown final cost.
 * This worker is NOT scheduled or exposed via a customer API in this phase.
 */
import { getPostgresPool } from "../utils/postgresPool";
import { normalizeCostUsd } from "./aiUnits";
import { settleAiUnits, flagAiReconciliation } from "./aiBalanceService";

const GENERATION_ENDPOINT = "https://openrouter.ai/api/v1/generation";
export interface GenerationCost {
  generationId: string;
  costUsd: string;
  promptTokens: number | null;
  completionTokens: number | null;
}

function validTokens(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : null;
}

export function parseGenerationCost(body: unknown, expectedId: string): GenerationCost {
  const data = (body as any)?.data;
  if (!data || data.id !== expectedId) throw new Error("Generation ID mismatch.");
  if (data.total_cost === null || data.total_cost === undefined) {
    throw new Error("Authoritative generation cost is not yet available.");
  }
  return {
    generationId: data.id,
    costUsd: normalizeCostUsd(data.total_cost),
    promptTokens: validTokens(data.tokens_prompt),
    completionTokens: validTokens(data.tokens_completion),
  };
}

/** Must use the same TGReposter-owned OpenRouter key that made the request. */
export async function fetchGenerationCost(
  generationId: string,
  key: string,
  fetchImpl: typeof fetch = globalThis.fetch,
  timeoutMs = 10_000
): Promise<GenerationCost> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) {
    throw new Error("Invalid generation lookup timeout.");
  }
  if (!/^gen-[A-Za-z0-9_-]{5,128}$/.test(generationId)) {
    throw new Error("Invalid OpenRouter generation identifier.");
  }
  if (!key) throw new Error("Commercial OpenRouter key is required.");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const url = new URL(GENERATION_ENDPOINT);
    url.searchParams.set("id",generationId);
    const request = Promise.resolve().then(async () => {
      const response = await fetchImpl(url.toString(), {
        method:"GET",
        headers:{ Authorization:`Bearer ${key}`, Accept:"application/json" },
        signal:controller.signal
      });
      if (!response.ok) {
        throw new Error(`OpenRouter generation lookup returned ${response.status}.`);
      }
      return parseGenerationCost(await response.json(), generationId);
    });
    // A broken or injected HTTP adapter might ignore AbortSignal entirely.
    // Bound the whole metadata lookup without assuming any zero-cost outcome.
    const deadline = new Promise<never>((_,reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("OpenRouter generation lookup timed out."));
      },timeoutMs);
    });
    return await Promise.race([request,deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

interface PendingUsage {
  owner_principal: string;
  request_key: string;
  provider_generation_id: string;
}
type Query = (sql: string,params: unknown[]) => Promise<{rows:any[]}>;

export interface ReconciliationReport {
  checked: number;
  settled: number;
  unresolved: number;
}

/** One bounded iteration. Due rows are claimed with database-backed exponential
 * backoff before any external call, so repeatedly failing generations cannot
 * starve other pending customers or hammer the provider.
 */
export async function reconcilePendingOpenRouterUsage(
  options: {
    apiKey?: string;
    limit?: number;
    fetchGeneration?: typeof fetchGenerationCost;
    settle?: typeof settleAiUnits;
    flag?: typeof flagAiReconciliation;
    /** Synthetic/Postgres adapter; never accepts browser-controlled queries. */
    query?: Query;
    env?: Record<string,string | undefined>;
  } = {}
): Promise<ReconciliationReport> {
  const env = options.env ?? process.env;
  if (env.TGREPOSTER_COMMERCIAL_AI_ENABLED !== "true") {
    throw new Error("Commercial AI reconciliation is not enabled.");
  }
  const apiKey = options.apiKey ?? env.TGREPOSTER_OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Commercial OpenRouter key is not configured.");
  const limit = options.limit ?? 20;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    throw new Error("Invalid reconciliation batch size.");
  }

  const query:Query = options.query ??
    ((sql,params) => getPostgresPool().query(sql,params));
  const { rows } = await query(
    `select owner_principal,request_key,provider_generation_id
     from public.ai_usage_events
     where provider='openrouter' and status='pending'
       and provider_generation_id is not null
       and reconciliation_note is not null
       and created_at < now() - interval '2 minutes'
       and (reconciliation_next_attempt_at is null
            or reconciliation_next_attempt_at <= now())
     order by coalesce(reconciliation_next_attempt_at,created_at),
              created_at asc limit $1`, [limit]
  ) as {rows:PendingUsage[]};
  const report: ReconciliationReport = { checked:0,settled:0,unresolved:0 };
  for (const usage of rows) {
    // Claim just this due request with atomic retry accounting. If a different
    // worker claimed it, skip without contacting OpenRouter twice.
    const claim = await query(
      `update public.ai_usage_events
       set reconciliation_attempts=reconciliation_attempts+1,
           reconciliation_next_attempt_at =
             now() + (case when reconciliation_attempts >= 5
                    then interval '24 hours'
                    else interval '1 hour' * (1 << reconciliation_attempts)
                    end)
       where owner_principal=$1 and request_key=$2
         and provider='openrouter' and status='pending'
         and provider_generation_id=$3
         and reconciliation_note is not null
         and (reconciliation_next_attempt_at is null
              or reconciliation_next_attempt_at<=now())
       returning id`,
      [usage.owner_principal,usage.request_key,usage.provider_generation_id]
    );
    if (!claim.rows.length) continue;
    report.checked++;
    let lookupComplete = false;
    try {
      const generation = await (options.fetchGeneration ?? fetchGenerationCost)(
        usage.provider_generation_id,apiKey
      );
      lookupComplete = true;
      const settled = await (options.settle ?? settleAiUnits)({
        ownerPrincipal:usage.owner_principal,
        requestKey:usage.request_key,
        actualCostUsd:generation.costUsd,
        status:"failed", // unknown output state: never claim success
        inputTokens:generation.promptTokens,
        outputTokens:generation.completionTokens,
        generationId:generation.generationId
      });
      if (settled.settled) report.settled++;
    } catch {
      report.unresolved++;
      // Never store raw provider response/error text, customer prompts or keys.
      await (options.flag ?? flagAiReconciliation)(
        usage.owner_principal, usage.request_key,
        lookupComplete ? "AI_SETTLEMENT_REVIEW_REQUIRED" :
          "AI_GENERATION_COST_RETRY_PENDING",
        usage.provider_generation_id
      ).catch(() => {
        // Failed reconciliation-note updates never justify a refund.
      });
    }
  }
  return report;
}
