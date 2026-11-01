import assert from "node:assert/strict";

export const STAGING_ORIGIN = "https://tgreposter-staging-production.up.railway.app";

// Credential-free GET-only security acceptance contract for the LIVE staging API.
// These are intentionally actual registered private routes, never mutations.
// Fail closed on 404, redirect, 2xx, 403, or any response other than 401.
const MISSING_ID = "00000000-0000-0000-0000-000000000000";
const INVALID_OWNER = "owner_principal=supabase%3Aforged-override";
export const STAGING_PRIVATE_GET_PATHS = [
  "/api/billing/overview",
  "/api/billing/overview?" + INVALID_OWNER,
  "/api/billing/ai-credits/status",
  "/api/billing/subscription/change-preview?targetPlanId=free",
  "/api/billing/checkout/status",
  "/api/billing/checkout/orders/" + MISSING_ID,
  "/api/channels",
  "/api/channels?" + INVALID_OWNER,
  "/api/promotion/bot-accounts",
  "/api/promotion/bot-accounts?" + INVALID_OWNER,
  "/api/promotion/targets",
  "/api/promotion/targets?" + INVALID_OWNER,
  "/api/promotion/campaigns",
  "/api/promotion/campaigns?" + INVALID_OWNER,
  "/api/promotion/campaigns/" + MISSING_ID,
  "/api/admin/sales-plans",
  "/api/crypto-payments/status",
  "/api/crypto-payments/overview",
  "/api/crypto-payments/notifications/status",
  "/api/crypto-payments/invoices/" + MISSING_ID,
  "/api/settings",
  "/api/supabase/status",
  "/api/ai/openrouter/models",
] as const;

export const STAGING_FORGED_TOKEN_GET_PATHS = [
  "/api/billing/overview",
  "/api/billing/subscription/change-preview?targetPlanId=free",
  "/api/billing/checkout/status",
  "/api/billing/checkout/orders/" + MISSING_ID,
  "/api/channels",
  "/api/promotion/campaigns",
  "/api/promotion/targets",
  "/api/crypto-payments/notifications/status",
  "/api/admin/sales-plans",
  "/api/supabase/status",
] as const;


export function requireStagingBase(value: string | undefined): URL {
  if (!value) throw new Error("Specify TGREPOSTER_STAGING_BASE_URL explicitly.");
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error("Invalid staging base URL."); }
  if (url.origin !== STAGING_ORIGIN || url.port || url.username || url.password ||
      url.search || url.hash || !["", "/"].includes(url.pathname)) {
    throw new Error("Refusing to send test requests to any host other than the exact staging origin.");
  }
  return url;
}

export function requireStagingApiUrl(url: URL, base: URL): void {
  if (url.origin !== base.origin || !url.pathname.startsWith("/api/") ||
      url.username || url.password || url.hash) {
    throw new Error("Refusing to send credentials outside the staging API.");
  }
}

export function refuseHttpRedirect(status: number): void {
  if (status >= 300 && status < 400) {
    throw new Error("Staging API redirect refused; credentials must not be forwarded.");
  }
}

export function validateTwoTestAccounts(accounts: Array<{email?: string; password?: string}>): void {
  if (accounts.length !== 2 || accounts.some(a =>
    !a.email?.includes("@") || !a.password || a.password.length < 8)) {
    throw new Error("Two existing email-confirmed staging-only test credentials are required in the private environment.");
  }
  if (accounts[0].email!.trim().toLowerCase() === accounts[1].email!.trim().toLowerCase()) {
    throw new Error("Staging test accounts must have distinct identities.");
  }
}

export interface StagingOwnerResourceEvidence {
  name: string;
  aliceOriginal: unknown[];
  aliceOverride: unknown[];
  bobOriginal: unknown[];
  bobOverride: unknown[];
}

type Overview = {
  availability: string;
  plan?: { id: string };
  subscription?: unknown;
  usage?: {sources: number;destinations:number;activeCampaigns:number};
  ai?: {includedAvailable:string;purchasedAvailable:string};
  orders?: unknown[];
};

export function ownerEvidence(view: Overview): string {
  return JSON.stringify({
    usage:view.usage ?? null,
    subscription:view.subscription ?? null,
    ai:view.ai ?? null,
    orders:view.orders ?? null,
    planId:view.plan?.id ?? null
  });
}

/**
 * A common empty Free response from two accounts is NOT positive evidence of
 * tenant isolation. Require distinct owner fixtures to call the gate PASS.
 * Overrides may not affect either owner snapshot, even when owners differ.
 */
export function assertIsolatedAccountEvidence(
  aliceOriginal:Overview, aliceOverride:Overview,
  bobOriginal:Overview, bobOverride:Overview,
  aliceChannels:unknown[], bobChannels:unknown[],
  aliceChannelOverride:unknown[], bobChannelOverride:unknown[],
  extraResources: ReadonlyArray<StagingOwnerResourceEvidence> = []
): void {
  assert.equal(ownerEvidence(aliceOriginal),ownerEvidence(aliceOverride),
    "An attempted owner override changed Alice's private billing view.");
  assert.equal(ownerEvidence(bobOriginal),ownerEvidence(bobOverride),
    "An attempted owner override changed Bob's private billing view.");
  assert.deepEqual(aliceChannels,aliceChannelOverride,
    "An attempted owner override changed Alice's private source channels.");
  assert.deepEqual(bobChannels,bobChannelOverride,
    "An attempted owner override changed Bob's private source channels.");
  // Include read-only promotion fixtures in the positive-evidence requirement.
  // No customer content, bot credentials, or bearer tokens are logged.
  const differentExtraResource = extraResources.map(resource => {
    assert.deepEqual(resource.aliceOriginal, resource.aliceOverride,
      "An attempted owner override changed Alice's private " + resource.name + ".");
    assert.deepEqual(resource.bobOriginal, resource.bobOverride,
      "An attempted owner override changed Bob's private " + resource.name + ".");
    return JSON.stringify(resource.aliceOriginal) !== JSON.stringify(resource.bobOriginal);
  }).some(Boolean);
  const differentBilling = ownerEvidence(aliceOriginal) !== ownerEvidence(bobOriginal);
  const differentChannels = JSON.stringify(aliceChannels) !== JSON.stringify(bobChannels);
  assert.ok(differentBilling || differentChannels || differentExtraResource,
    "INCONCLUSIVE: Both test accounts have indistinguishable read-only data. " +
    "Prepare distinct staging-only fixtures before certifying owner isolation.");
}
