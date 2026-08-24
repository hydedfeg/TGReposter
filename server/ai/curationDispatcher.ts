import {
  requestGeminiCuration,
  type GeminiClient
} from "./providers/geminiProvider";
import { requestOpenRouterCuration } from "./providers/openRouterProvider";
import { INVALID_CURATION_OUTPUT_ERROR } from "./curationOutput";

export const DEFAULT_AI_REQUEST_TIMEOUT_MS = 30_000;

class AIRequestTimeoutError extends Error {
  constructor(provider: string, timeoutMs: number) {
    super(`${provider} request timed out after ${timeoutMs} ms.`);
    this.name = "AIRequestTimeoutError";
  }
}

async function withProviderTimeout<T>(
  operation: Promise<T>,
  provider: string,
  timeoutMs: number,
  onTimeout?: () => void
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new AIRequestTimeoutError(provider, timeoutMs));
      onTimeout?.();
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation, deadline]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

export interface CurationDispatchRequest {
  provider: string;
  model: string;
  prompt: string;
  geminiClient: GeminiClient | null;
  geminiApiKey?: string;
  openRouterApiKey?: string;
  timeoutMs?: number;
}

export type CurationDispatchResult =
  | { ok: true; result: string }
  | { ok: false; status: number; error: string };

function validateCurationResult(result: string): CurationDispatchResult {
  if (!result) {
    return {
      ok: false,
      status: 502,
      error: INVALID_CURATION_OUTPUT_ERROR
    };
  }

  return { ok: true, result };
}

export async function dispatchCuration({
  provider,
  model,
  prompt,
  geminiClient,
  geminiApiKey,
  openRouterApiKey,
  timeoutMs = DEFAULT_AI_REQUEST_TIMEOUT_MS
}: CurationDispatchRequest): Promise<CurationDispatchResult> {
  if (provider === "gemini") {
    if (!geminiApiKey || !geminiClient) {
      return {
        ok: false,
        status: 400,
        error: "Gemini API Key is missing. Please add GEMINI_API_KEY in the Secrets panel."
      };
    }

    try {
      const result = await withProviderTimeout(
        requestGeminiCuration({
          client: geminiClient,
          model,
          prompt
        }),
        "Gemini",
        timeoutMs
      );
      return validateCurationResult(result);
    } catch (err: any) {
      console.error("Gemini curation error:", err);
      return {
        ok: false,
        status: err instanceof AIRequestTimeoutError ? 504 : 500,
        error: err.message || "Gemini API call failed"
      };
    }
  }

  if (provider === "openrouter") {
    if (!openRouterApiKey) {
      return {
        ok: false,
        status: 400,
        error: "OpenRouter API Key is missing. Please add OPENROUTER_API_KEY in the Secrets panel."
      };
    }

    const controller = new AbortController();
    try {
      const result = await withProviderTimeout(
        requestOpenRouterCuration({
          apiKey: openRouterApiKey,
          model,
          prompt,
          signal: controller.signal
        }),
        "OpenRouter",
        timeoutMs,
        () => controller.abort()
      );

      if (result.ok === false) {
        return {
          ok: false,
          status: 500,
          error: `${result.error} (${result.status})`
        };
      }

      return validateCurationResult(result.result);
    } catch (err: any) {
      console.error("OpenRouter curation error:", err);
      return {
        ok: false,
        status: err instanceof AIRequestTimeoutError ? 504 : 500,
        error: err.message || "OpenRouter connection failed"
      };
    }
  }

  return {
    ok: false,
    status: 400,
    error: `Unsupported AI Provider: ${provider}`
  };
}
