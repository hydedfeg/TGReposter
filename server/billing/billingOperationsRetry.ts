import { getPostgresPool } from "../utils/postgresPool";
import type { BillingStage, BillingCandidate } from "./billingOperationsWorker";

function checkCandidate(stage: BillingStage, candidate: BillingCandidate): void {
  if (!["subscriptions","topups","renewals","allowances"].includes(stage)
    || !candidate.owner_principal?.trim()
    || !/^[a-f0-9-]{36}$/i.test(candidate.id)) {
    throw new Error("Invalid internal billing retry identity.");
  }
}

/**
 * Exponential persisted retry backoff: 2, 4, 8, 16, 32 then 60 minutes.
 * All unfulfilled orders remain in their canonical order table. This table
 * only delays retries; it never drops payment evidence.
 */
export async function noteBillingOperationFailure(
  stage: BillingStage,
  candidate: BillingCandidate,
  code: string
): Promise<void> {
  checkCandidate(stage,candidate);
  const safeCode = /^[A-Z][A-Z0-9_]{0,63}$/.test(code)
    ? code : "UNEXPECTED_ERROR";
  await getPostgresPool().query(
    `insert into public.billing_operation_attempts
       (stage,owner_principal,item_id,failures,last_error_code,next_retry_at)
     values($1,$2,$3::uuid,1,$4,now()+interval '2 minutes')
     on conflict(stage,owner_principal,item_id)
     do update set
       failures=least(1000000,public.billing_operation_attempts.failures+1),
       last_error_code=excluded.last_error_code,
       next_retry_at=now()+make_interval(secs=>least(3600,
         (60*power(2,least(6,public.billing_operation_attempts.failures+1)))::int)),
       updated_at=now()`,
    [stage,candidate.owner_principal,candidate.id,safeCode]
  );
}

export async function clearBillingOperationFailure(
  stage: BillingStage,
  candidate: BillingCandidate
): Promise<void> {
  checkCandidate(stage,candidate);
  await getPostgresPool().query(
    `delete from public.billing_operation_attempts
     where stage=$1 and owner_principal=$2 and item_id=$3::uuid`,
    [stage,candidate.owner_principal,candidate.id]
  );
}
