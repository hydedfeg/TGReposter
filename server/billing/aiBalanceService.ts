import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { getPostgresPool } from "../utils/postgresPool";
import {
  costUsdToAiUnits,
  displayAiUnits,
  normalizeCostUsd,
  parseAiUnits,
  parseSignedAiUnits,
} from "./aiUnits";

/**
 * Transactional, tenant-scoped AI Unit reservation and settlement.
 *
 * Not wired to production routes yet. Commercial checkout must grant monthly
 * Units from the authoritative plan catalog before this service is enabled.
 * This API ONLY accepts trusted server-derived owner/period/model parameters.
 */
export class AiUnitsError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "AiUnitsError";
  }
}

export interface ReserveAiInput {
  ownerPrincipal: string;
  requestKey: string;
  operation: string;
  modelId: string;
  maximumUnits: string;
  periodStart?: string;
  periodEnd?: string;
}

export interface AiReservation {
  requestId: string;
  reservedUnits: string;
  includedUnits: string;
  purchasedUnits: string;
}

export interface AiSettlementInput {
  ownerPrincipal: string;
  requestKey: string;
  actualCostUsd: string | number;
  status: "success" | "failed";
  inputTokens?: number | null;
  outputTokens?: number | null;
  generationId?: string;
}

export interface AiSettlement {
  requestId: string;
  chargedUnits: string;
  settled: boolean;
}

const keyFor = (kind: string, requestKey: string, bucket: string): string =>
  `ai:${kind}:${crypto.createHash("sha256").update(requestKey).digest("hex").slice(0, 48)}:${bucket}`;

function ownerKey(owner: string): string {
  const normalized = owner.trim().toLowerCase();
  if (!normalized || normalized.length > 255) {
    throw new AiUnitsError(400, "INVALID_OWNER", "Invalid AI billing owner.");
  }
  return normalized;
}

function requestKeyValue(key: string): string {
  const normalized = key.trim();
  if (normalized.length < 8 || normalized.length > 128) {
    throw new AiUnitsError(400, "INVALID_REQUEST_KEY", "Invalid AI request key.");
  }
  return normalized;
}

function checkPeriod(start?: string, end?: string): { start: string | null; end: string | null } {
  if (!start && !end) return { start: null, end: null };
  if (!start || !end || !Number.isFinite(Date.parse(start))
    || !Number.isFinite(Date.parse(end)) || Date.parse(start) >= Date.parse(end)) {
    throw new AiUnitsError(400, "INVALID_AI_PERIOD", "Invalid AI billing period.");
  }
  return { start, end };
}

async function lockOwner(client: PoolClient, owner: string): Promise<void> {
  // Serialize ALL concurrent reservations and settlements for one owner,
  // including requests handled by different Railway processes.
  await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `tgreposter:ai-balance:${owner}`,
  ]);
}

function minBigint(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

export async function reserveAiUnits(input: ReserveAiInput): Promise<AiReservation> {
  const owner = ownerKey(input.ownerPrincipal);
  const requestKey = requestKeyValue(input.requestKey);
  const period = checkPeriod(input.periodStart, input.periodEnd);
  const requested = parseAiUnits(input.maximumUnits);
  if (requested <= 0n) {
    throw new AiUnitsError(400, "INVALID_RESERVATION", "Reservation must be positive.");
  }
  if (!input.operation.trim() || !input.modelId.trim()) {
    throw new AiUnitsError(400, "INVALID_AI_OPERATION", "Missing AI operation or model.");
  }

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await lockOwner(client, owner);

    const duplicate = await client.query(
      "select id from public.ai_usage_events where owner_principal=$1 and request_key=$2",
      [owner, requestKey]
    );
    if (duplicate.rowCount) {
      throw new AiUnitsError(409, "DUPLICATE_AI_REQUEST", "AI request already reserved.");
    }

    const { rows: balances } = await client.query(
      `
      select
        coalesce(sum(units_delta) filter (
          where balance_type='included'
            and period_start=$2::timestamptz
            and period_end=$3::timestamptz
        ),0)::text as included,
        coalesce(sum(units_delta) filter (where balance_type='purchased'),0)::text as purchased
      from public.ai_unit_ledger
      where owner_principal=$1
      `,
      [owner, period.start, period.end]
    );
    const includedAvailable = period.start
      ? parseSignedAiUnits(String(balances[0]?.included ?? "0")) : 0n;
    const purchasedAvailable = parseSignedAiUnits(String(balances[0]?.purchased ?? "0"));
    const positiveIncluded = includedAvailable > 0n ? includedAvailable : 0n;
    const positivePurchased = purchasedAvailable > 0n ? purchasedAvailable : 0n;

    // Net debt must offset otherwise-positive grants. Without this check,
    // purchased-balance overages could be bypassed by new included credits.
    if (includedAvailable + purchasedAvailable < requested
      || positiveIncluded + positivePurchased < requested) {
      throw new AiUnitsError(402, "AI_BALANCE_EXHAUSTED", "Not enough AI Units for this model request.");
    }
    const included = minBigint(positiveIncluded, requested);
    const purchased = requested - included;

    const usage = await client.query(
      `
      insert into public.ai_usage_events
        (owner_principal, request_key, operation, model_id, provider, status)
      values ($1,$2,$3,$4,'openrouter','pending')
      returning id
      `,
      [owner, requestKey, input.operation, input.modelId]
    );
    const requestId: string = usage.rows[0].id;

    if (included > 0n) {
      await client.query(
        `
        insert into public.ai_unit_ledger
          (owner_principal,event_key,balance_type,event_kind,units_delta,
           period_start,period_end,usage_event_id)
        values ($1,$2,'included','consume',$3,$4,$5,$6)
        `,
        [owner, keyFor("hold", requestKey, "included"), displayAiUnits(-included),
          period.start, period.end, requestId]
      );
    }
    if (purchased > 0n) {
      await client.query(
        `
        insert into public.ai_unit_ledger
          (owner_principal,event_key,balance_type,event_kind,units_delta,usage_event_id)
        values ($1,$2,'purchased','consume',$3,$4)
        `,
        [owner, keyFor("hold", requestKey, "purchased"), displayAiUnits(-purchased),
          requestId]
      );
    }
    await client.query("COMMIT");
    return {
      requestId,
      reservedUnits: displayAiUnits(requested),
      includedUnits: displayAiUnits(included),
      purchasedUnits: displayAiUnits(purchased)
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function optionalTokens(value: number | null | undefined): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new AiUnitsError(400, "INVALID_AI_TOKENS", "Invalid AI token usage.");
  }
  return value;
}

export async function settleAiUnits(input: AiSettlementInput): Promise<AiSettlement> {
  const owner = ownerKey(input.ownerPrincipal);
  const requestKey = requestKeyValue(input.requestKey);
  const costUsd = normalizeCostUsd(input.actualCostUsd);
  const charged = parseAiUnits(costUsdToAiUnits(input.actualCostUsd));
  const promptTokens = optionalTokens(input.inputTokens);
  const completionTokens = optionalTokens(input.outputTokens);
  if (!["success", "failed"].includes(input.status)) {
    throw new AiUnitsError(400, "INVALID_AI_STATE", "Invalid AI settlement state.");
  }

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await lockOwner(client, owner);
    const { rows: usage } = await client.query(
      `
      select id, status, units_charged::text as units_charged
      from public.ai_usage_events
      where owner_principal=$1 and request_key=$2 for update
      `,
      [owner, requestKey]
    );
    if (!usage[0]) {
      throw new AiUnitsError(404, "AI_REQUEST_NOT_FOUND", "AI reservation not found.");
    }
    if (usage[0].status !== "pending") {
      // Idempotent repeated callback does not create a second debit.
      await client.query("COMMIT");
      return {
        requestId: usage[0].id,
        chargedUnits: String(usage[0].units_charged),
        settled: false
      };
    }

    const requestId: string = usage[0].id;
    const { rows: holds } = await client.query(
      `
      select balance_type, units_delta::text as units_delta, period_start, period_end
      from public.ai_unit_ledger
      where owner_principal=$1 and usage_event_id=$2
        and event_key = any($3::text[])
      `,
      [owner, requestId, [
        keyFor("hold", requestKey, "included"),
        keyFor("hold", requestKey, "purchased")
      ]]
    );
    let reserved = 0n;
    let included = 0n;
    let purchased = 0n;
    let start: string | null = null;
    let end: string | null = null;
    for (const hold of holds) {
      const held = -parseSignedAiUnits(hold.units_delta);
      if (held <= 0n) throw new AiUnitsError(500, "AI_LEDGER_INCONSISTENT", "Invalid reservation.");
      reserved += held;
      if (hold.balance_type === "included") {
        included += held;
        start = hold.period_start;
        end = hold.period_end;
      } else if (hold.balance_type === "purchased") {
        purchased += held;
      }
    }
    if (reserved <= 0n) {
      throw new AiUnitsError(500, "AI_LEDGER_INCONSISTENT", "Reservation missing debit.");
    }

    if (charged < reserved) {
      // Return unspent reservation to the buckets that originally funded it.
      // Purchased balance is refunded first; included credits return to their
      // original period even if that period has since ended.
      let refund = reserved - charged;
      const purchasedRefund = minBigint(refund, purchased);
      refund -= purchasedRefund;
      if (purchasedRefund > 0n) {
        await client.query(
          `
          insert into public.ai_unit_ledger
            (owner_principal,event_key,balance_type,event_kind,units_delta,usage_event_id)
          values ($1,$2,'purchased','reverse',$3,$4)
          `,
          [owner, keyFor("release", requestKey, "purchased"),
            displayAiUnits(purchasedRefund), requestId]
        );
      }
      if (refund > 0n) {
        await client.query(
          `
          insert into public.ai_unit_ledger
            (owner_principal,event_key,balance_type,event_kind,units_delta,
             period_start,period_end,usage_event_id)
          values ($1,$2,'included','reverse',$3,$4,$5,$6)
          `,
          [owner, keyFor("release", requestKey, "included"),
            displayAiUnits(refund), start, end, requestId]
        );
      }
    } else if (charged > reserved) {
      // Unexpected overage is fully recorded as a purchased-balance debt.
      // Subsequent reservations are denied until the debt is cleared.
      await client.query(
        `
        insert into public.ai_unit_ledger
          (owner_principal,event_key,balance_type,event_kind,units_delta,usage_event_id)
        values ($1,$2,'purchased','consume',$3,$4)
        `,
        [owner, keyFor("overage", requestKey, "purchased"),
          displayAiUnits(-(charged - reserved)), requestId]
      );
    }

    await client.query(
      `
      update public.ai_usage_events
      set status=$3, provider_cost_usd=$4, units_charged=$5,
          input_tokens=$6, output_tokens=$7,
          provider_generation_id=$8, reconciliation_note=null
      where id=$1 and owner_principal=$2 and status='pending'
      `,
      [requestId, owner, input.status, costUsd, displayAiUnits(charged),
        promptTokens, completionTokens, input.generationId ?? null]
    );
    await client.query("COMMIT");
    return { requestId, chargedUnits: displayAiUnits(charged), settled: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * For timeout/unknown-cost cases, DO NOT release the reservation. The pending
 * request must be reviewed against OpenRouter's generation/activity records.
 */
export async function flagAiReconciliation(
  ownerPrincipal: string,
  requestKey: string,
  note: string,
  generationId?: string
): Promise<void> {
  const owner = ownerKey(ownerPrincipal);
  const key = requestKeyValue(requestKey);
  await getPostgresPool().query(
    `
    update public.ai_usage_events
    set reconciliation_note=$3,
        provider_generation_id=coalesce(provider_generation_id,$4)
    where owner_principal=$1 and request_key=$2 and status='pending'
    `,
    [owner, key, note.slice(0, 500), generationId ?? null]
  );
}
