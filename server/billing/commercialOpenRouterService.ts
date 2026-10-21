import { Buffer } from "node:buffer";
import { openRouterModelCatalog, type OpenRouterTextModel } from "../ai/openRouterModelCatalog";
import { requestOpenRouterCuration } from "../ai/providers/openRouterProvider";
import { estimateMaxAiUnits } from "./aiUnits";
import {
  reserveAiUnits,
  settleAiUnits,
  flagAiReconciliation,
  AiUnitsError,
} from "./aiBalanceService";

export interface CommercialCurationInput {
  ownerPrincipal: string; // trusted server-derived identity, NEVER from request body
  requestKey: string; // Idempotency-Key from validated authenticated request
  operation: string;
  modelId: string;
  prompt: string;
  periodStart?: string; // resolved from owner subscription by billing backend
  periodEnd?: string;
}

export interface CommercialCurationOutput {
  text: string;
  modelId: string;
  generationId?: string;
  chargedUnits: string;
}

/** Upper bound for platform-funded provider calls after funds are reserved. */
export const DEFAULT_COMMERCIAL_AI_PROVIDER_TIMEOUT_MS = 30_000;
export const MAX_COMMERCIAL_AI_PROVIDER_TIMEOUT_MS = 60_000;

export class CommercialAIError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "CommercialAIError";
  }
}

/**
 * This module is intentionally NOT routed to customer requests until commercial
 * subscriptions, monthly grants and payment fulfillment have been verified.
 * Existing BYOK requests are unaffected by this service.
 */
export async function commercialOpenRouterCuration(
  input: CommercialCurationInput,
  deps: {
    getModel?: (id: string) => Promise<OpenRouterTextModel | null>;
    callProvider?: typeof requestOpenRouterCuration;
    reserve?: typeof reserveAiUnits;
    settle?: typeof settleAiUnits;
    reconcile?: typeof flagAiReconciliation;
    apiKey?: string;
    /** Internal test/ops override; never passed from customer requests. */
    timeoutMs?: number;
  } = {}
): Promise<CommercialCurationOutput> {
  const prompt = input.prompt.trim();
  if (!prompt || Buffer.byteLength(prompt, "utf8") > 64_000) {
    throw new CommercialAIError(400, "INVALID_AI_PROMPT", "AI prompt size is invalid.");
  }
  const timeoutMs = deps.timeoutMs ?? DEFAULT_COMMERCIAL_AI_PROVIDER_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1
      || timeoutMs > MAX_COMMERCIAL_AI_PROVIDER_TIMEOUT_MS) {
    throw new CommercialAIError(500, "INVALID_COMMERCIAL_AI_TIMEOUT",
      "Commercial AI timeout configuration is invalid.");
  }
  const apiKey = deps.apiKey ?? process.env.TGREPOSTER_OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new CommercialAIError(503, "COMMERCIAL_AI_UNAVAILABLE", "Included AI is not configured.");
  }

  // Models are chosen freely from OpenRouter's compatible catalog. Unknown
  // pricing or non-text models are rejected, never silently treated as free.
  const model = await (deps.getModel ?? ((id) => openRouterModelCatalog.getModel(id)))(input.modelId);
  if (!model) {
    throw new CommercialAIError(400, "UNAVAILABLE_AI_MODEL", "Model is not available for text curation.");
  }

  // Constrain the output tokens and conservatively preauthorize prompt tokens.
  // This is a risk bound, not an exact tokenizer; additional cost beyond it is
  // still recorded as debt by settleAiUnits to prevent an unbilled overage.
  const maxOutputTokens = Math.min(2048, model.maxCompletionTokens ?? 2048);
  const maxInputTokens = Buffer.byteLength(prompt, "utf8") * 2;
  if (model.contextLength && maxInputTokens + maxOutputTokens > model.contextLength) {
    throw new CommercialAIError(400, "AI_CONTEXT_TOO_LONG", "Prompt exceeds this model's context limit.");
  }

  const maximumUnits = estimateMaxAiUnits(
    model.pricing, maxInputTokens, maxOutputTokens, 3
  );
  const reserve = deps.reserve ?? reserveAiUnits;
  const settle = deps.settle ?? settleAiUnits;
  const reconcile = deps.reconcile ?? flagAiReconciliation;
  const callProvider = deps.callProvider ?? requestOpenRouterCuration;

  try {
    await reserve({
      ownerPrincipal: input.ownerPrincipal,
      requestKey: input.requestKey,
      operation: input.operation,
      modelId: model.id,
      maximumUnits,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd
    });
  } catch (error) {
    if (error instanceof AiUnitsError) {
      throw new CommercialAIError(error.status, error.code, error.message);
    }
    throw error;
  }

  let generationId: string | undefined;
  const controller = new AbortController();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    // Abort the underlying HTTP request AND race its promise: third-party
    // adapters that ignore AbortSignal must not hang a customer request.
    // Timeout leaves the reserved Units pending, never auto-refunds them.
    const providerPromise = Promise.resolve().then(() => callProvider({
      apiKey,
      model: model.id,
      prompt,
      includeUsage: true,
      maxTokens: maxOutputTokens,
      signal: controller.signal
    }));
    const timeout = new Promise<never>((_, reject) => {
      deadline = setTimeout(() => {
        controller.abort();
        reject(new CommercialAIError(504, "AI_PROVIDER_TIMEOUT",
          "AI provider response timed out; reserved Units require reconciliation."));
      }, timeoutMs);
    });
    const result = await Promise.race([providerPromise, timeout]);
    if (!result.ok) {
      // An upstream HTTP error is not reliable evidence of zero charge.
      throw new CommercialAIError(502, "AI_PROVIDER_ERROR",
        "OpenRouter request failed; reserved Units require reconciliation.");
    }
    generationId = result.generationId;
    if (!result.usage) {
      throw new CommercialAIError(
        502, "AI_USAGE_UNVERIFIED", "Provider usage is not yet verified."
      );
    }
    const settled = await settle({
      ownerPrincipal: input.ownerPrincipal,
      requestKey: input.requestKey,
      actualCostUsd: result.usage.costUsd,
      status: result.result ? "success" : "failed",
      inputTokens: result.usage.promptTokens,
      outputTokens: result.usage.completionTokens,
      generationId
    });
    if (!result.result) {
      throw new CommercialAIError(502, "AI_OUTPUT_EMPTY", "AI provider returned empty content.");
    }
    return {
      text: result.result,
      modelId: result.modelId || model.id,
      generationId,
      chargedUnits: settled.chargedUnits
    };
  } catch (error) {
    // Failure after reserve is ambiguous until the provider's cost is known.
    // flagAiReconciliation updates only PENDING usage. Already-settled entries
    // remain untouched (e.g. a charged request with empty model output).
    // Never persist raw provider errors. They can contain user text,
    // internal URLs, or provider details that do not belong in the ledger.
    const reason = error instanceof CommercialAIError
      ? error.code : "AI_PROVIDER_OUTCOME_UNKNOWN";
    await reconcile(
      input.ownerPrincipal, input.requestKey, reason, generationId
    ).catch((reconcileError) => {
      console.error("Failed to flag AI usage reconciliation:", {
        code: (reconcileError as any)?.code ?? "RECONCILIATION_WRITE_FAILED"
      });
    });
    throw error;
  } finally {
    if (deadline !== undefined) clearTimeout(deadline);
  }
}
