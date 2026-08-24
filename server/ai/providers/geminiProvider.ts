import { normalizeCurationOutput } from "../curationOutput";

export interface GeminiClient {
  models: {
    generateContent(request: {
      model: string;
      contents: string;
    }): Promise<{ text?: unknown }>;
  };
}

interface GeminiRequest {
  client: GeminiClient;
  model: string;
  prompt: string;
}

export async function requestGeminiCuration({
  client,
  model,
  prompt
}: GeminiRequest): Promise<string> {
  const response = await client.models.generateContent({
    model,
    contents: prompt
  });

  return normalizeCurationOutput(response.text);
}
