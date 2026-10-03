export const AI_OUTPUT_LANGUAGE_IDS = [
  "en",
  "es",
  "ru",
  "fr",
  "de",
  "zh",
  "ar",
  "fa",
] as const;

export type AIOutputLanguageId = (typeof AI_OUTPUT_LANGUAGE_IDS)[number];

export const AI_OUTPUT_LANGUAGE_DEFINITIONS: Record<
  AIOutputLanguageId,
  { promptName: string }
> = {
  en: { promptName: "English" },
  es: { promptName: "Spanish" },
  ru: { promptName: "Russian" },
  fr: { promptName: "French" },
  de: { promptName: "German" },
  zh: { promptName: "Chinese" },
  ar: { promptName: "Arabic" },
  fa: { promptName: "Persian (Farsi)" },
};

const LEGACY_LANGUAGE_ALIASES: Record<string, AIOutputLanguageId> = {
  english: "en",
  spanish: "es",
  russian: "ru",
  french: "fr",
  german: "de",
  chinese: "zh",
  arabic: "ar",
  persian: "fa",
  farsi: "fa",
  "persian (farsi)": "fa",
};

export function isAIOutputLanguageId(value: unknown): value is AIOutputLanguageId {
  return typeof value === "string"
    && AI_OUTPUT_LANGUAGE_IDS.includes(value as AIOutputLanguageId);
}

export function resolveAIOutputLanguageId(value: unknown): AIOutputLanguageId | null {
  if (isAIOutputLanguageId(value)) return value;
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return LEGACY_LANGUAGE_ALIASES[normalized] ?? null;
}

export function getAIOutputLanguagePromptName(id: AIOutputLanguageId): string {
  return AI_OUTPUT_LANGUAGE_DEFINITIONS[id].promptName;
}
