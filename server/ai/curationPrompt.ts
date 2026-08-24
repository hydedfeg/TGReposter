export const CURATION_ACTIONS = [
  "rephrase",
  "summarize",
  "hashtags",
  "translate"
] as const;

export type CurationAction = (typeof CURATION_ACTIONS)[number];

export function isCurationAction(action: unknown): action is CurationAction {
  return typeof action === "string" && CURATION_ACTIONS.includes(action as CurationAction);
}

export function buildCurationPrompt(
  action: CurationAction,
  text: string,
  context?: string
): string {
  switch (action) {
    case "rephrase": {
      const tone = context || "professional and engaging";
      return `You are an expert Telegram channel editor. Rephrase this post to sound ${tone}. Ensure the writing is concise, captures readers' interest instantly, preserves any external URL links, and is formatted nicely for reading. Respond with ONLY the finalized text, no conversational introductions or explanations.\n\nPost:\n${text}`;
    }
    case "summarize":
      return `You are a professional news summarizer. Write a highly scannable, engaging 1-2 sentence summary of this post. Respond with ONLY the summary content, no intros, no quotes.\n\nPost:\n${text}`;
    case "hashtags":
      return `Generate 3 to 6 highly relevant, catchy hashtags based on the content of this post. Output them on a single line, space-separated, with '#' characters. Do not include any other text.\n\nPost:\n${text}`;
    case "translate": {
      const targetLang = context || "English";
      return `Translate the following Telegram post into ${targetLang}. Retain the original layout, bullet points, and any link URLs. Respond with ONLY the translated text, no meta-comments.\n\nPost:\n${text}`;
    }
  }
}
