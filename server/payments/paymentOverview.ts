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
  const [counts, networkStates, invoices, transactions, events] = await Promise.all([
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
  ]);

  return {
    summary: counts.rows[0] ?? { total: 0, paid: 0, active: 0, attention: 0 },
    networkStates: networkStates.rows.map((row) => ({
      network: row.network,
      last_scanned_at: row.last_scanned_at,
      updated_at: row.updated_at,
    })),
    networkHealth: assessCryptoPaymentNetworkHealth(networkStates.rows as any, env, now),
    invoices: invoices.rows,
    transactions: transactions.rows,
    events: events.rows,
  };
}
