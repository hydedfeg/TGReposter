// Server-side OpenRouter model catalog. Never exposes API keys to the browser.
// Model data is untrusted external input: only a small validated projection is cached.
export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const CACHE_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

export interface OpenRouterTextModel {
  id: string;
  name: string;
  provider: string;
  contextLength: number | null;
  maxCompletionTokens: number | null;
  pricing: {
    prompt: string;
    completion: string;
    request: string;
  };
}

function validPrice(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const valueString = String(value);
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?(?:e-?\d+)?$/i.test(valueString)) return null;
  const numberValue = Number(valueString);
  return Number.isFinite(numberValue) && numberValue >= 0 ? valueString : null;
}

export function normalizeOpenRouterModels(body: unknown): OpenRouterTextModel[] {
  if (!body || typeof body !== "object" || !Array.isArray((body as any).data)) {
    throw new Error("Invalid OpenRouter model catalog response.");
  }
  const models = new Map<string, OpenRouterTextModel>();
  for (const raw of (body as any).data) {
    if (!raw || typeof raw !== "object") continue;
    const id = raw.id;
    if (typeof id !== "string" || !/^[a-zA-Z0-9_./:+-]{3,256}$/.test(id)) continue;
    const outputs = raw.architecture?.output_modalities;
    // The curation pipeline supports text output only.
    if (!Array.isArray(outputs) || !outputs.includes("text")) continue;
    const prompt = validPrice(raw.pricing?.prompt);
    const completion = validPrice(raw.pricing?.completion);
    const request = validPrice(raw.pricing?.request ?? "0");
    // Unknown prices must not be treated as free.
    if (prompt === null || completion === null || request === null) continue;

    models.set(id, {
      id,
      name: typeof raw.name === "string" ? raw.name.slice(0, 200) : id,
      provider: id.split("/")[0],
      contextLength: Number.isSafeInteger(raw.context_length) && raw.context_length > 0
        ? raw.context_length : null,
      maxCompletionTokens: Number.isSafeInteger(raw.top_provider?.max_completion_tokens)
        && raw.top_provider.max_completion_tokens > 0
        ? raw.top_provider.max_completion_tokens : null,
      pricing: { prompt, completion, request }
    });
  }
  return [...models.values()].sort((a, b) => a.id.localeCompare(b.id));
}

type CatalogFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class OpenRouterModelCatalog {
  private cache: { models: OpenRouterTextModel[]; expiresAt: number } | null = null;
  private pending: Promise<OpenRouterTextModel[]> | null = null;

  constructor(
    private fetchImpl: CatalogFetch = globalThis.fetch,
    private now: () => number = Date.now
  ) {}

  async listModels(): Promise<OpenRouterTextModel[]> {
    if (this.cache && this.cache.expiresAt > this.now()) return this.cache.models;
    if (this.pending) return this.pending;

    this.pending = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const response = await this.fetchImpl(OPENROUTER_MODELS_URL, {
          method: "GET",
          headers: { "Accept": "application/json" },
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`OpenRouter models unavailable (${response.status}).`);
        const models = normalizeOpenRouterModels(await response.json());
        if (!models.length) throw new Error("OpenRouter returned no compatible text models.");
        this.cache = { models, expiresAt: this.now() + CACHE_MS };
        return models;
      } finally {
        clearTimeout(timeout);
      }
    })();

    try {
      return await this.pending;
    } catch (error) {
      // A recent verified cache is safer than failing every request during an
      // upstream interruption. The pricing path should also use a hard per-request cap.
      if (this.cache) return this.cache.models;
      throw error;
    } finally {
      this.pending = null;
    }
  }

  async getModel(id: string): Promise<OpenRouterTextModel | null> {
    return (await this.listModels()).find((model) => model.id === id) ?? null;
  }
}

export const openRouterModelCatalog = new OpenRouterModelCatalog();
