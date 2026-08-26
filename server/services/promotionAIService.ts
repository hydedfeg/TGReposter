import { GoogleGenAI } from "@google/genai";
import { dispatchCuration } from "../ai/curationDispatcher";
import {
  buildPromotionAIPrompt,
  isPromotionAIAction,
  isPromotionAIStyle,
  type PromotionAIAction,
  type PromotionAIStyle,
} from "../ai/promotionPrompt";
import {
  PromotionCampaignRepository,
  type PromotionCampaignRecord,
  type PromotionCampaignPostRecord,
  type PromotionSourcePostRecord,
} from "../repositories/promotionCampaignRepository";

interface AISettingsSnapshot {
  aiConfig?: {
    provider?: string;
    model?: string;
  };
}

export type PromotionAISettingsReader = () => Promise<AISettingsSnapshot>;

type PromotionAIDispatcher = typeof dispatchCuration;

interface PromotionAIRepository {
  getCampaign(id: string): Promise<PromotionCampaignRecord | null>;
  getCampaignPost(id: string): Promise<PromotionCampaignPostRecord | null>;
  getSourcePost(id: string): Promise<PromotionSourcePostRecord | null>;
}

export class PromotionAIError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "PromotionAIError";
  }
}

const mutableStatuses = new Set(["draft", "ready"]);

function optionalText(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new PromotionAIError(400, "VALIDATION_ERROR", `${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > maxLength) {
    throw new PromotionAIError(400, "VALIDATION_ERROR", `${field} must be ${maxLength} characters or fewer.`);
  }
  return trimmed;
}

function sourceTextForAI(sourcePost: PromotionSourcePostRecord): string {
  return sourcePost.editedText?.trim() || sourcePost.originalText?.trim() || "";
}

export interface PromotionAIGenerateResult {
  result: string;
  action: PromotionAIAction;
  style: PromotionAIStyle;
  language?: string;
  provider: string;
  model: string;
}

export class PromotionAIService {
  private geminiClient: GoogleGenAI | null = null;
  private geminiClientKey: string | undefined;

  constructor(
    private readSettings: PromotionAISettingsReader,
    private repository: PromotionAIRepository = new PromotionCampaignRepository(),
    private dispatcher: PromotionAIDispatcher = dispatchCuration
  ) {}

  private getGeminiClient(apiKey?: string) {
    if (!apiKey) return null;
    if (!this.geminiClient || this.geminiClientKey !== apiKey) {
      this.geminiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "tgreposter-promotion-ai",
          },
        },
      });
      this.geminiClientKey = apiKey;
    }
    return this.geminiClient;
  }

  async generate(
    campaignId: string,
    campaignPostId: string,
    body: any
  ): Promise<PromotionAIGenerateResult> {
    const campaign = await this.repository.getCampaign(campaignId);
    if (!campaign) {
      throw new PromotionAIError(404, "NOT_FOUND", "Promotion campaign not found.");
    }
    if (!mutableStatuses.has(campaign.status)) {
      throw new PromotionAIError(
        409,
        "CAMPAIGN_STATE_CONFLICT",
        "AI promotion copy can only be generated while the campaign is draft or ready."
      );
    }

    const campaignPost = await this.repository.getCampaignPost(campaignPostId);
    if (!campaignPost || campaignPost.campaignId !== campaignId) {
      throw new PromotionAIError(404, "NOT_FOUND", "Promotion campaign post not found.");
    }

    const sourcePost = await this.repository.getSourcePost(campaignPost.postId);
    if (!sourcePost) {
      throw new PromotionAIError(409, "REFERENCE_CONFLICT", "The collected source post is no longer available.");
    }

    if (!isPromotionAIAction(body?.action)) {
      throw new PromotionAIError(400, "VALIDATION_ERROR", "Invalid promotion AI action.");
    }
    const action = body.action as PromotionAIAction;

    const requestedStyle = body?.style ?? "professional";
    if (!isPromotionAIStyle(requestedStyle)) {
      throw new PromotionAIError(400, "VALIDATION_ERROR", "Invalid promotion AI style.");
    }
    const style = requestedStyle as PromotionAIStyle;

    const language = optionalText(body?.language, "language", 80);
    if (action === "translate" && !language) {
      throw new PromotionAIError(400, "VALIDATION_ERROR", "language is required for translation.");
    }

    const instructions = optionalText(body?.instructions, "instructions", 600);
    const currentText = optionalText(body?.currentText, "currentText", 16_000);
    const sourceText = sourceTextForAI(sourcePost);
    if (!sourceText && !currentText) {
      throw new PromotionAIError(400, "EMPTY_SOURCE", "This campaign post has no text available for AI generation.");
    }

    const prompt = buildPromotionAIPrompt({
      action,
      sourceText,
      currentText: currentText || campaignPost.promotionText,
      style,
      language,
      instructions,
    });

    const settings = await this.readSettings();
    const provider = settings.aiConfig?.provider || "gemini";
    const model = settings.aiConfig?.model || "gemini-3.5-flash";
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const openRouterApiKey = process.env.OPENROUTER_API_KEY;

    const dispatchResult = await this.dispatcher({
      provider,
      model,
      prompt,
      geminiClient: this.getGeminiClient(geminiApiKey),
      geminiApiKey,
      openRouterApiKey,
    });

    if (dispatchResult.ok === false) {
      throw new PromotionAIError(
        dispatchResult.status,
        "AI_PROVIDER_ERROR",
        dispatchResult.error,
        { provider, model }
      );
    }

    return {
      result: dispatchResult.result,
      action,
      style,
      language,
      provider,
      model,
    };
  }
}
