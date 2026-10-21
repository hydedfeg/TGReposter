import { ownerPrincipalForUser, type AuthenticatedUserIdentity } from "../services/userPrincipalService";
import { ensureMonthlyAIAllowance, AIGrantError } from "./monthlyAIAllowance";
import {
  commercialOpenRouterCuration,
  CommercialAIError
} from "./commercialOpenRouterService";
import type { CurationAction } from "../ai/curationPrompt";

/**
 * Opt-in commercial AI route for server-funded OpenRouter requests.
 *
 * BYOK curation is unchanged. This path remains disabled unless the
 * independently controlled launch flag and core commercial AI switch are
 * BOTH enabled, and the database backend is configured.
 *
 * Never accept owner, subscription period, cost, or balance from the browser.
 */
type Environment = Record<string, string | undefined>;

export function isCommercialCurationRouteEnabled(env: Environment = process.env): boolean {
  // The platform-funded route cannot work without its own provider key.
  // Check configuration only; never disclose the key to clients.
  return env.TGREPOSTER_COMMERCIAL_AI_ENABLED === "true"
    && env.TGREPOSTER_COMMERCIAL_AI_ROUTE_ENABLED === "true"
    && Boolean(env.DATABASE_URL?.trim())
    && Boolean(env.TGREPOSTER_OPENROUTER_API_KEY?.trim());
}

export class CustomerCommercialCurationError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "CustomerCommercialCurationError";
  }
}

export interface CustomerCommercialCurationInput {
  user: AuthenticatedUserIdentity | null | undefined;
  provider: string;
  modelId: string;
  action: CurationAction;
  prompt: string;
  idempotencyKey: unknown;
}

export interface CustomerCommercialCurationResponse {
  result: string;
  billingMode: "included";
  chargedUnits: string;
  modelId: string;
}

/** This service is used only when the explicit billingMode=included is set. */
export async function runCustomerCommercialCuration(
  input: CustomerCommercialCurationInput,
  deps: {
    env?: Environment;
    ensureAllowance?: typeof ensureMonthlyAIAllowance;
    curate?: typeof commercialOpenRouterCuration;
  } = {}
): Promise<CustomerCommercialCurationResponse> {
  if (!isCommercialCurationRouteEnabled(deps.env)) {
    throw new CustomerCommercialCurationError(
      503, "COMMERCIAL_AI_DISABLED", "Included AI curation is not yet available."
    );
  }
  if (!input.user) {
    throw new CustomerCommercialCurationError(401, "AI_AUTH_REQUIRED", "Sign in required.");
  }
  if (input.provider !== "openrouter") {
    throw new CustomerCommercialCurationError(
      409, "AI_PROVIDER_NOT_SUPPORTED",
      "Select OpenRouter to use included AI Units."
    );
  }
  if (!input.modelId || input.modelId.length > 256) {
    throw new CustomerCommercialCurationError(400, "INVALID_AI_MODEL", "Select a valid model.");
  }
  const key = input.idempotencyKey;
  // Require one fresh client-generated UUID per user action. The underlying
  // DB unique(owner,request_key) prevents charging a retry twice.
  if (typeof key !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
    throw new CustomerCommercialCurationError(
      400, "INVALID_AI_REQUEST_KEY", "Provide a UUID v4 Idempotency-Key header."
    );
  }

  const owner = ownerPrincipalForUser(input.user);
  try {
    const allowance = await (deps.ensureAllowance ?? ensureMonthlyAIAllowance)(owner);
    const curated = await (deps.curate ?? commercialOpenRouterCuration)({
      ownerPrincipal: owner,
      requestKey: key,
      modelId: input.modelId,
      operation: input.action,
      prompt: input.prompt,
      periodStart: allowance.period.start,
      periodEnd: allowance.period.end
    });
    return {
      result: curated.text,
      billingMode: "included",
      chargedUnits: curated.chargedUnits,
      modelId: curated.modelId
    };
  } catch (error) {
    if (error instanceof AIGrantError) {
      throw new CustomerCommercialCurationError(
        error.code === "OVERLAPPING_ALLOWANCE" ? 409 : 503,
        error.code,
        error.code === "OVERLAPPING_ALLOWANCE"
          ? "AI allowance requires billing review."
          : "Included AI allowance is not yet available."
      );
    }
    if (error instanceof CommercialAIError) {
      const code = error.code;
      const clientSafe = error.status >= 400 && error.status < 500;
      throw new CustomerCommercialCurationError(
        error.status, code,
        clientSafe ? error.message : "AI curation is temporarily unavailable."
      );
    }
    throw error;
  }
}
