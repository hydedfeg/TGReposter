import { assessCryptoPaymentNetworkHealth } from "./paymentHealth";
import { getPostgresPool } from "../utils/postgresPool";

export interface CryptoPaymentOverviewQuery {
  (sql: string): Promise<{ rows: Record<string, any>[] }>;
}

export async function loadCryptoPaymentOverview(
  query: CryptoPaymentOverviewQuery = (sql) => getPostgresPool().query(sql),
  env: Record<string, string | undefined> = process.env,
  now: Date = new Date()
) {
  // A platform super-admin can audit payments without changing per-owner ledger
  // attribution. Call only behind authMiddleware + requireSuperAdmin.
  // All datasets are bounded and select explicit non-secret columns.
  const [counts, networkStates, invoices, transactions, events, discrepancies] = await Promise.all([
    query(`
      select
        count(*)::int as total,
        count(*) filter (where status = 'paid')::int as paid,
        count(*) filter (where status in ('pending','detected','confirming'))::int as active,
        count(*) filter (where status in ('failed','expired','underpaid','overpaid'))::int as attention
      from public.crypto_payment_invoices
    `),
    query(`
      select network, receiving_address, token_identifier, last_scanned_at, updated_at
      from public.crypto_payment_network_state
      order by last_scanned_at desc nulls last
      limit 100
    `),
    query(`
      select id, owner_principal, asset_code, network,
             requested_amount::text, expected_amount::text,
             status, expires_at, created_at, confirmed_at
      from public.crypto_payment_invoices
      order by created_at desc, id desc
      limit 50
    `),
    query(`
      select id, invoice_id, owner_principal, network,
             tx_hash, amount::text, confirmations, status,
             first_seen_at, confirmed_at
      from public.crypto_payment_transactions
      order by first_seen_at desc, id desc
      limit 30
    `),
    query(`
      select id, owner_principal, invoice_id, source, event_type, occurred_at
      from public.crypto_payment_events
      order by occurred_at desc, id desc
      limit 30
    `),
    query(`
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
    `),
  ]);

  const networkHealth = assessCryptoPaymentNetworkHealth(networkStates.rows as any, env, now);
  const networkAlerts = networkHealth.networks
    .filter((item) => item.state === "stale" || item.state === "never_scanned")
    .map((item) => ({
      code: item.state === "stale" ? "scanner_delayed" : "scanner_not_started",
      severity: "warning" as const,
      network: item.network,
      invoiceId: null,
      ownerPrincipal: null,
      occurredAt: item.lastScannedAt,
    }));
  const ledgerAlerts = discrepancies.rows.slice(0, 30).map((row) => ({
    code: row.code as string,
    severity: row.code === "paid_without_confirmed_transfer" || row.code === "confirmed_transfer_unpaid"
      ? "critical" as const
      : "warning" as const,
    network: row.network as string,
    invoiceId: row.invoice_id as string,
    ownerPrincipal: row.owner_principal as string,
    occurredAt: row.occurred_at as string | Date | null,
  }));

  return {
    reconciliation: {
      checkedAt: now.toISOString(),
      alerts: [...networkAlerts, ...ledgerAlerts],
      truncated: discrepancies.rows.length > 30,
      // We only inspect persisted ledger transactions. Unmatched on-chain
      // observations are not stored and cannot be audited from this report.
      includesUnmatchedOnChainTransfers: false,
    },
    summary: counts.rows[0] ?? { total: 0, paid: 0, active: 0, attention: 0 },
    networkStates: networkStates.rows.map((row) => ({
      network: row.network,
      last_scanned_at: row.last_scanned_at,
      updated_at: row.updated_at,
    })),
    networkHealth,
    invoices: invoices.rows,
    transactions: transactions.rows,
    events: events.rows,
  };
}
