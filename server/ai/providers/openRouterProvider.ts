import { normalizeCurationOutput } from "../curationOutput";
import { extractOpenRouterUsage, type OpenRouterCostUsage } from "../../billing/aiUnits";

export const OPENROUTER_CHAT_COMPLETIONS_URL =
  "https://openrouter.ai/api/v1/chat/completions";

type OpenRouterFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

interface OpenRouterRequest {
  apiKey: string;
  model: string;
  prompt: string;
  fetchImpl?: OpenRouterFetch;
  signal?: AbortSignal;
  maxTokens?: number;
  includeUsage?: boolean;
}

export type OpenRouterResult =
  | { ok: true; result: string; usage?: OpenRouterCostUsage | null; generationId?: string; modelId?: string }
  | { ok: false; status: number; error: string };

export async function requestOpenRouterCuration({
  apiKey,
  model,
  prompt,
  fetchImpl = globalThis.fetch,
  signal,
  maxTokens,
  includeUsage = false
}: OpenRouterRequest): Promise<OpenRouterResult> {
  const response = await fetchImpl(OPENROUTER_CHAT_COMPLETIONS_URL, {
    method: "POST",
    ...(signal ? { signal } : {}),
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://ai.studio/build",
      "X-Title": "Telegram Curator"
    },
    body: JSON.stringify({
      model,
      ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("OpenRouter API returned error:", response.status, errorText);
    let error = "OpenRouter API call failed";
    try {
      const parsedError = JSON.parse(errorText);
      if (parsedError.error?.message) {
        error = parsedError.error.message;
      }
    } catch (_) {}

    return { ok: false, status: response.status, error };
  }

  const data = (await response.json()) as any;
  const result = normalizeCurationOutput(data.choices?.[0]?.message?.content);
  if (!includeUsage) return { ok: true, result };

  // OpenRouter includes billed usage.cost on non-streaming completions.
  // Missing cost is NOT zero: commercial callers must retain the reservation
  // for later reconciliation (using generationId when provided).
  let usage: OpenRouterCostUsage | null = null;
  try {
    usage = extractOpenRouterUsage(data);
  } catch {
    // Leave the reservation pending; never grant a free request by assumption.
  }
  return {
    ok: true,
    result,
    usage,
    generationId: typeof data.id === "string" ? data.id : undefined,
    modelId: typeof data.model === "string" ? data.model : undefined
  };
}
