import { getPostgresPool } from "../utils/postgresPool";
import {
  loadCryptoPaymentAlertSources, PaymentAlertMonitoringError,
  type AlertSourceOverview, type CryptoPaymentOverviewQuery,
} from "./paymentAlertSources";
import { CRYPTO_PAYMENT_NETWORKS, type CryptoPaymentNetwork } from "./types";

type Env = Record<string, string | undefined>;
type Severity = "warning" | "critical";
type Category = "scanner" | "invoice" | "unassigned";
type NotificationState = "pending" | "skipped";
interface Candidate {
  fingerprint: string;
  category: Category;
  code: string;
  network: CryptoPaymentNetwork;
  severity: Severity;
  ownerPrincipal: string | null;
  invoiceId: string | null;
  txHash: string | null;
}

export function isCryptoPaymentAlertJournalEnabled(env: Env = process.env) {
  return env.CRYPTO_PAYMENT_ALERTS_ENABLED?.trim().toLowerCase() === "true";
}

export function isPaymentAlertTelegramConfigured(env: Env = process.env): boolean {
  return env.CRYPTO_PAYMENT_ALERT_TELEGRAM_ENABLED?.trim().toLowerCase() === "true" &&
    /^\d+:[A-Za-z0-9_-]{20,}$/.test(env.CRYPTO_PAYMENT_ALERT_TELEGRAM_BOT_TOKEN ?? "") &&
    /^-?\d+$/.test(env.CRYPTO_PAYMENT_ALERT_TELEGRAM_CHAT_ID ?? "");
}

function asNetwork(input: string): CryptoPaymentNetwork {
  if (!(CRYPTO_PAYMENT_NETWORKS as readonly string[]).includes(input)) {
    throw new Error("Unexpected alert network");
  }
  return input as CryptoPaymentNetwork;
}

function buildCandidates(overview: AlertSourceOverview): Candidate[] {
  const entries: Candidate[] = [];
  for (const alert of overview.reconciliation.alerts) {
    const network = asNetwork(alert.network);
    const isInvoice = Boolean(alert.invoiceId && alert.ownerPrincipal);
    if (isInvoice !== Boolean(alert.invoiceId || alert.ownerPrincipal)) continue;
    const fingerprint = isInvoice
      ? `invoice:${network}:${alert.code}:${alert.ownerPrincipal}:${alert.invoiceId}`
      : `scanner:${network}:${alert.code}`;
    entries.push({
      fingerprint,
      category: isInvoice ? "invoice" : "scanner",
      code: alert.code,
      network,
      severity: alert.severity,
      ownerPrincipal: alert.ownerPrincipal,
      invoiceId: alert.invoiceId,
      txHash: null,
    });
  }
  for (const observation of overview.unassignedTransfers.items) {
    const network = asNetwork(observation.network);
    const fingerprint = `unassigned:${network}:${observation.tx_hash}:${observation.event_index}`;
    entries.push({
      fingerprint,
      category: "unassigned",
      code: observation.reason,
      network,
      severity: "warning",
      ownerPrincipal: null,
      invoiceId: null,
      txHash: observation.tx_hash,
    });
  }
  return entries;
}

/**
 * Reconcile only within a serialized payment-scheduler advisory lock.
 * If a source query was truncated, do not silently resolve invisible alerts.
 */
export async function reconcileCryptoPaymentAlertJournal(
  env: Env = process.env,
  loadOverview: (query:CryptoPaymentOverviewQuery,env:Env)=>Promise<AlertSourceOverview> = loadCryptoPaymentAlertSources,
  pool = getPostgresPool()
): Promise<{ openedOrUpdated: number; resolved: number; truncated: boolean }> {
  if (!isCryptoPaymentAlertJournalEnabled(env)) {
    return { openedOrUpdated: 0, resolved: 0, truncated: false };
  }
  const overview = await loadOverview((sql) => pool.query(sql), env);
  const candidates = buildCandidates(overview);
  const notificationState: NotificationState = isPaymentAlertTelegramConfigured(env) ? "pending" : "skipped";
  const fingerprints = [...new Set(candidates.map(item => item.fingerprint))];
  let client;
  try {client=await pool.connect();}
  catch(error){throw new PaymentAlertMonitoringError("journal_connect",error);}
  let resolved = 0;
  let stage:"journal_begin"|"journal_upsert"|"journal_resolve"|"journal_commit"="journal_begin";
  try {
    await client.query("begin");
    stage="journal_upsert";
    for (const candidate of candidates) {
      await client.query(`
        insert into public.crypto_payment_operational_alerts
          (fingerprint, category, code, network, severity, owner_principal, invoice_id,
           tx_hash, notification_state, next_notification_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,
          case when $9='pending' then now() else null end)
        on conflict (fingerprint) do update
        set last_seen_at=now(), updated_at=now(), status='open',
            severity=excluded.severity, resolved_at=null,
            notification_state=case
              when crypto_payment_operational_alerts.status='resolved'
                then excluded.notification_state
              else crypto_payment_operational_alerts.notification_state
            end,
            notification_attempts=case
              when crypto_payment_operational_alerts.status='resolved' then 0
              else crypto_payment_operational_alerts.notification_attempts
            end,
            next_notification_at=case
              when crypto_payment_operational_alerts.status='resolved'
                then excluded.next_notification_at
              else crypto_payment_operational_alerts.next_notification_at
            end
      `,[
        candidate.fingerprint,candidate.category,candidate.code,candidate.network,
        candidate.severity,candidate.ownerPrincipal,candidate.invoiceId,candidate.txHash,
        notificationState,
      ]);
    }
    stage="journal_resolve";
    const truncatedCategories = [
      ...(overview.reconciliation.truncated ? ["invoice"] : []),
      ...(overview.unassignedTransfers.truncated ? ["unassigned"] : []),
    ];
    const { rowCount } = await client.query(`
      update public.crypto_payment_operational_alerts
      set status='resolved', resolved_at=now(), updated_at=now()
      where status='open'
        and not (fingerprint=any($1::text[]))
        and not (category=any($2::text[]))
    `,[fingerprints,truncatedCategories]);
    resolved = rowCount ?? 0;
    stage="journal_commit";
    await client.query("commit");
  } catch (error) {
    // The original failure is authoritative even if rollback itself fails.
    try {await client.query("rollback");} catch {}
    throw new PaymentAlertMonitoringError(stage,error);
  } finally {
    client.release();
  }
  return {
    openedOrUpdated: candidates.length,
    resolved,
    truncated: overview.reconciliation.truncated || overview.unassignedTransfers.truncated,
  };
}

interface DeliveryRow {
  id: number;
  code: string;
  severity: Severity;
  network: CryptoPaymentNetwork;
  attempts: number;
}

function message(row: DeliveryRow): string {
  // Do not include customer principals, merchant addresses, tx hashes, or credentials.
  return `TGReposter payment alert\nSeverity: ${row.severity}\nNetwork: ${row.network}\nCode: ${row.code}\nOpen the super-admin Payment Operations dashboard for details.`;
}

/**
 * Optional, backend-only Telegram delivery. Invoked from the serialized
 * scanner lock. Delivery is at-least-once: an interrupted process after a
 * Telegram success and before the database update may retry the message.
 */
export async function deliverCryptoPaymentAlerts(
  env: Env = process.env,
  pool = getPostgresPool(),
  send: typeof fetch = fetch
): Promise<{ sent: number; failed: number }> {
  if (!isCryptoPaymentAlertJournalEnabled(env) || !isPaymentAlertTelegramConfigured(env)) {
    return { sent: 0, failed: 0 };
  }
  const { rows } = await pool.query(`
    select id, code, severity, network, notification_attempts as attempts
    from public.crypto_payment_operational_alerts
    where status='open' and notification_state='pending'
      and coalesce(next_notification_at, now()) <= now()
      and notification_attempts < 5
    order by id asc limit 3
  `);
  let sent = 0;
  let failed = 0;
  const token = env.CRYPTO_PAYMENT_ALERT_TELEGRAM_BOT_TOKEN!;
  const chatId = env.CRYPTO_PAYMENT_ALERT_TELEGRAM_CHAT_ID!;
  for (const row of rows as DeliveryRow[]) {
    let ok = false;
    try {
      const response = await send(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: message(row), disable_web_page_preview: true }),
        signal: AbortSignal.timeout(8_000),
      });
      ok = response.ok;
    } catch { /* Keep transport diagnostics secret-free. */ }
    if (ok) {
      const result = await pool.query(`
        update public.crypto_payment_operational_alerts
        set notification_state='sent', notified_at=now(), updated_at=now(),
            notification_attempts=notification_attempts+1, next_notification_at=null
        where id=$1 and notification_state='pending' and status='open'
      `, [row.id]);
      sent += result.rowCount ?? 0;
    } else {
      await pool.query(`
        update public.crypto_payment_operational_alerts
        set notification_attempts=notification_attempts+1,
            next_notification_at=now() + interval '5 minutes',
            updated_at=now()
        where id=$1 and notification_state='pending'
      `, [row.id]);
      failed += 1;
    }
  }
  return { sent, failed };
}
