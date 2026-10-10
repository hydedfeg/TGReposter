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
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<GenerationCost> {
  if (!/^gen-[A-Za-z0-9_-]{5,128}$/.test(generationId)) {
    throw new Error("Invalid OpenRouter generation identifier.");
  }
  if (!key) throw new Error("Commercial OpenRouter key is required.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const url = new URL(GENERATION_ENDPOINT);
    url.searchParams.set("id",generationId);
    const response = await fetchImpl(url.toString(), {
      method:"GET",
      headers:{ Authorization:`Bearer ${key}`, Accept:"application/json" },
      signal:controller.signal
    });
    if (!response.ok) throw new Error(`OpenRouter generation lookup returned ${response.status}.`);
    return parseGenerationCost(await response.json(), generationId);
  } finally {
    clearTimeout(timeout);
  }
}

interface PendingUsage {
  owner_principal: string;
  request_key: string;
  provider_generation_id: string;
}

export interface ReconciliationReport {
  checked: number;
  settled: number;
  unresolved: number;
}

/** One bounded iteration; no automatically repeated high-cost API calls. */
export async function reconcilePendingOpenRouterUsage(
  options: {
    apiKey?: string;
    limit?: number;
    fetchGeneration?: typeof fetchGenerationCost;
    settle?: typeof settleAiUnits;
    flag?: typeof flagAiReconciliation;
  } = {}
): Promise<ReconciliationReport> {
  if (process.env.TGREPOSTER_COMMERCIAL_AI_ENABLED !== "true") {
    throw new Error("Commercial AI reconciliation is not enabled.");
  }
  const apiKey = options.apiKey ?? process.env.TGREPOSTER_OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Commercial OpenRouter key is not configured.");
  const limit = options.limit ?? 20;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    throw new Error("Invalid reconciliation batch size.");
  }

  const { rows } = await getPostgresPool().query<PendingUsage>(
    `select owner_principal,request_key,provider_generation_id
     from public.ai_usage_events
     where provider='openrouter' and status='pending'
       and provider_generation_id is not null
       and reconciliation_note is not null
       and created_at < now() - interval '2 minutes'
     order by created_at asc limit $1`, [limit]
  );
  const report: ReconciliationReport = { checked:0,settled:0,unresolved:0 };
  for (const usage of rows) {
    report.checked++;
    try {
      const generation = await (options.fetchGeneration ?? fetchGenerationCost)(
        usage.provider_generation_id,apiKey
      );
      await (options.settle ?? settleAiUnits)({
        ownerPrincipal:usage.owner_principal,
        requestKey:usage.request_key,
        actualCostUsd:generation.costUsd,
        status:"failed", // unknown output state: never claim success
        inputTokens:generation.promptTokens,
        outputTokens:generation.completionTokens,
        generationId:generation.generationId
      });
      report.settled++;
    } catch (error) {
      report.unresolved++;
      await (options.flag ?? flagAiReconciliation)(
        usage.owner_principal, usage.request_key,
        error instanceof Error ? error.message : "Generation reconciliation pending",
        usage.provider_generation_id
      ).catch(() => {
        // Never treat a failed reconciliation write as a zero-cost settlement.
      });
    }
  }
  return report;
}
