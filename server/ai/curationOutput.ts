export const INVALID_CURATION_OUTPUT_ERROR =
  "AI provider returned an empty or invalid response. Please try again.";

export function normalizeCurationOutput(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
