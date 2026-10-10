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
  } = {}
): Promise<CommercialCurationOutput> {
  const prompt = input.prompt.trim();
  if (!prompt || Buffer.byteLength(prompt, "utf8") > 64_000) {
    throw new CommercialAIError(400, "INVALID_AI_PROMPT", "AI prompt size is invalid.");
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
  try {
    const result = await callProvider({
      apiKey,
      model: model.id,
      prompt,
      includeUsage: true,
      maxTokens: maxOutputTokens
    });
    if (!result.ok) {
      // An upstream HTTP error is not reliable evidence of zero charge.
      throw new CommercialAIError(502, "AI_PROVIDER_ERROR", result.error);
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
    await reconcile(
      input.ownerPrincipal, input.requestKey,
      error instanceof Error ? error.message : "AI request requires reconciliation",
      generationId
    ).catch((reconcileError) => {
      console.error("Failed to flag AI usage reconciliation:", reconcileError);
    });
    throw error;
  }
}
