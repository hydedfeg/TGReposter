export function splitGraphemes(value: string): string[] {
  if (typeof Intl.Segmenter === "function") {
    return Array.from(
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value),
      (entry) => entry.segment,
    );
  }

  return Array.from(value);
}

export function getInitials(
  value: string | null | undefined,
  fallback = "TG",
): string {
  const normalized = value?.trim();
  if (!normalized) return fallback;

  const words = normalized.split(/\s+/).filter(Boolean);
  const selected =
    words.length > 1
      ? [splitGraphemes(words[0])[0], splitGraphemes(words[words.length - 1])[0]]
      : splitGraphemes(normalized.replace(/^@/, "")).slice(0, 2);

  const initials = selected.filter(Boolean).join("");
  return initials ? initials.toLocaleUpperCase() : fallback;
}
