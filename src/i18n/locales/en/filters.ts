const filters = {
  header: {
    title: "Content Filters",
    description: "Matching posts arrive in Pending; non-matching posts go directly to Archive.",
  },
  caseSensitive: {
    label: "Case sensitive",
    enabled: "Case-sensitive matching enabled",
    disabled: "Case-sensitive matching disabled",
  },
  positive: {
    label: "Positive keywords (trigger curation)",
    inputLabel: "Add a positive keyword or phrase",
    placeholder: "e.g. AI, startup, benchmark",
    empty: "No positive keywords added. If no keywords or hashtags are defined, all scraped posts are matched.",
    remove: "Remove positive keyword {{value}}",
  },
  hashtags: {
    label: "Required hashtags",
    inputLabel: "Add a required hashtag",
    placeholder: "tech, ai, health",
    empty: "No required hashtags added.",
    remove: "Remove hashtag {{value}}",
  },
  negative: {
    label: "Negative keywords (ignore/archive immediately)",
    inputLabel: "Add a negative keyword or phrase",
    placeholder: "e.g. promo, airdrop, crypto, spam",
    empty: "No negative keywords. Add terms like “spam” or “ad” to exclude matching posts automatically.",
    remove: "Remove negative keyword {{value}}",
  },
  actions: {
    addPositive: "Add positive keyword",
    addHashtag: "Add required hashtag",
    addNegative: "Add negative keyword",
  },
} as const;

export default filters;
