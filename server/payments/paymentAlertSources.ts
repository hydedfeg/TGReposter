import { getPostgresPool } from "../utils/postgresPool";
import { assessCryptoPaymentNetworkHealth } from "./paymentHealth";
import type { CryptoPaymentOverviewQuery, loadCryptoPaymentOverview } from "./paymentOverview";

type Env=Record<string,string|undefined>;
export type AlertReadStage="network_state"|"invoice_reconciliation"|"unassigned_transfers";
export type AlertSourceOverview=Pick<Awaited<ReturnType<typeof loadCryptoPaymentOverview>>,
  "reconciliation"|"unassignedTransfers">;

/** Expose only controlled SQLSTATE metadata, never database messages or SQL. */
export function safeAlertSqlstate(error:unknown):string {
  const code=error&&typeof error==="object"&&"code" in error
    ? (error as {code?:unknown}).code : undefined;
  return typeof code==="string"&&/^[A-Z0-9]{5}$/.test(code)?code:"UNKNOWN";
}

export class PaymentAlertMonitoringError extends Error {
  constructor(
    readonly stage:AlertReadStage|"journal_connect"|"journal_begin"|"journal_upsert"|
      "journal_resolve"|"journal_commit",
    cause:unknown
  ){
    super("Payment alert monitoring operation failed.");
    this.name="PaymentAlertMonitoringError";
    this.code=safeAlertSqlstate(cause);
  }
  readonly code:string;
}

/**
 * The background alert journal needs only these three read-only inputs.
 * Admin history, global counts, transfers and previous journal rows belong
 * to the dashboard, not to the 60-second background monitoring path.
 *
 * Sequential reads give a controlled failing stage and avoid an eight-query
 * fanout at startup. If ANY read fails, the journal never opens or resolves
 * alerts from a partial snapshot.
 */
export async function loadCryptoPaymentAlertSources(
  query:CryptoPaymentOverviewQuery=(sql)=>getPostgresPool().query(sql),
  env:Env=process.env,
  now:Date=new Date()
):Promise<AlertSourceOverview>{
  async function read(stage:AlertReadStage,sql:string){
    try{return await query(sql);}
    catch(error){throw new PaymentAlertMonitoringError(stage,error);}
  }
  const networkStates=await read("network_state",`
      select network, receiving_address, token_identifier, last_scanned_at, updated_at
      from public.crypto_payment_network_state
      order by last_scanned_at desc nulls last
      limit 100
    `);
  const discrepancies=await read("invoice_reconciliation",`
      with issues as (
        select 'paid_without_confirmed_transfer'::text as code,
               i.id as invoice_id, i.owner_principal, i.network, i.updated_at as occurred_at
        from public.crypto_payment_invoices i
        where i.status = 'paid' and not exists (
          select 1 from public.crypto_payment_transactions t
          where t.owner_principal = i.owner_principal and t.invoice_id = i.id
            and t.status = 'confirmed'
        )

        union all

        select 'confirmed_transfer_unpaid'::text as code,
               i.id as invoice_id, i.owner_principal, i.network,
               coalesce(t.confirmed_at, t.updated_at) as occurred_at
        from public.crypto_payment_transactions t
        join public.crypto_payment_invoices i
          on i.owner_principal = t.owner_principal and i.id = t.invoice_id
        where t.status = 'confirmed' and i.status <> 'paid'
          and coalesce(t.confirmed_at, t.updated_at) < now() - interval '5 minutes'

        union all

        select 'confirmation_delayed'::text as code,
               i.id as invoice_id, i.owner_principal, i.network,
               coalesce(i.detected_at, i.created_at) as occurred_at
        from public.crypto_payment_invoices i
        where i.status in ('detected', 'confirming')
          and coalesce(i.detected_at, i.created_at) < now() - interval '1 hour'

        union all

        select 'invoice_exception'::text as code,
               i.id as invoice_id, i.owner_principal, i.network, i.updated_at as occurred_at
        from public.crypto_payment_invoices i
        where i.status in ('underpaid', 'overpaid', 'failed')
      )
      select code, invoice_id, owner_principal, network, occurred_at
      from issues
      order by occurred_at desc, invoice_id desc
      limit 31
    `);
  const unassigned=await read("unassigned_transfers",`
      select network, tx_hash, event_index, amount::text,
             confirmations, reason, observed_at, first_seen_at, last_seen_at
      from public.crypto_payment_unassigned_transfers
      where resolved_at is null
      order by last_seen_at desc, network asc, tx_hash asc, event_index asc
      limit 31
    `);
  const health=assessCryptoPaymentNetworkHealth(networkStates.rows as any,env,now);
  const scannerAlerts=health.networks
    .filter(x=>x.state==="stale"||x.state==="never_scanned")
    .map(x=>({
      code:x.state==="stale"?"scanner_delayed":"scanner_not_started",
      severity:"warning" as const,network:x.network,
      invoiceId:null,ownerPrincipal:null,occurredAt:x.lastScannedAt
    }));
  const ledgerAlerts=discrepancies.rows.slice(0,30).map(row=>({
    code:row.code as string,
    severity:row.code==="paid_without_confirmed_transfer"||
      row.code==="confirmed_transfer_unpaid"?"critical" as const:"warning" as const,
    network:row.network as string,
    invoiceId:row.invoice_id as string,
    ownerPrincipal:row.owner_principal as string,
    occurredAt:row.occurred_at as string|Date|null
  }));
  return {
    reconciliation:{
      checkedAt:now.toISOString(),
      alerts:[...scannerAlerts,...ledgerAlerts],
      truncated:discrepancies.rows.length>30,
      includesUnmatchedOnChainTransfers:true
    },
    unassignedTransfers:{
      items:unassigned.rows.slice(0,30),
      truncated:unassigned.rows.length>30
    }
  };
}
