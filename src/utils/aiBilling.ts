/** Commercial AI is an explicit per-request choice. BYOK must remain
 * wire-compatible with every existing /api/ai/curate caller.
 */
export type AiBillingMode = "byok" | "included";
export type AiCreditAvailability = "loading" | "ready" | "disabled" | "unavailable";

export function buildAiBillingRequest(
  mode: AiBillingMode,
  availability: AiCreditAvailability,
  createKey: () => string = () => crypto.randomUUID()
): {
  body: { billingMode?: "included" };
  headers: Record<string, string>;
} {
  if (mode === "byok") return { body: {}, headers: {} };
  if (availability !== "ready") {
    throw new Error("Included AI Units are not available for this account.");
  }
  return {
    body: { billingMode: "included" },
    headers: { "Idempotency-Key": createKey() }
  };
}
