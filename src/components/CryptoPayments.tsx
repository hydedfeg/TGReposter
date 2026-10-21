import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity, AlertTriangle, CheckCircle2, Clock3, CreditCard,
  DatabaseZap, RefreshCw, SearchCheck, ShieldCheck, Wallet,
} from "lucide-react";
import { normalizeAppLocale } from "../i18n";
import { safeResponseJson } from "../utils/api";

type PaymentNetwork = "bsc" | "ethereum" | "ton";
type Operation = "preflight" | "scan" | "notification-test";
interface NetworkConfig {
  id: PaymentNetwork;
  asset: string;
  assetProvenance: string;
  requiredConfirmations: number;
}
interface PaymentStatus { enabled: boolean; networks: NetworkConfig[] }
interface NotificationStatus {
  journalEnabled: boolean;
  telegramDeliveryEnabled: boolean;
  tokenPresent: boolean;
  chatPresent: boolean;
  testEnabled: boolean;
  readyForTest: boolean;
  readyForDelivery: boolean;
}
interface ScanState { network: PaymentNetwork; last_scanned_at: string | null }
interface Invoice {
  id: string;
  owner_principal: string;
  network: PaymentNetwork;
  expected_amount: string;
  status: string;
  created_at: string;
  expires_at: string;
  confirmed_at: string | null;
}
interface Transaction {
  id: string;
  owner_principal: string;
  network: PaymentNetwork;
  tx_hash: string;
  amount: string;
  confirmations: number;
  status: string;
  first_seen_at: string;
}
interface PaymentEvent {
  id: string;
  source: string;
  event_type: string;
  owner_principal: string;
  occurred_at: string;
}
interface NetworkScanHealth {
  network: PaymentNetwork;
  state: "disabled" | "never_scanned" | "recent" | "stale";
  lastScannedAt: string | null;
  ageSeconds: number | null;
}
interface ReconciliationAlert {
  code: "scanner_delayed" | "scanner_not_started"
    | "paid_without_confirmed_transfer" | "confirmed_transfer_unpaid"
    | "confirmation_delayed" | "invoice_exception";
  severity: "warning" | "critical";
  network: PaymentNetwork;
  invoiceId: string | null;
  ownerPrincipal: string | null;
  occurredAt: string | null;
}
interface UnassignedTransfer {
  network: PaymentNetwork;
  tx_hash: string;
  event_index: string;
  amount: string;
  confirmations: number;
  reason: "unmatched" | "ambiguous";
  observed_at: string;
  first_seen_at: string;
  last_seen_at: string;
}
interface PersistedAlert {
  id: number;
  category: "scanner" | "invoice" | "unassigned";
  code: string;
  network: PaymentNetwork;
  severity: "warning" | "critical";
  status: "open" | "resolved";
  first_seen_at: string;
  last_seen_at: string;
  notified_at: string | null;
  notification_state: "pending" | "skipped" | "sent";
}
interface Overview {
  persistedAlerts: PersistedAlert[];
  unassignedTransfers: { items: UnassignedTransfer[]; truncated: boolean };
  reconciliation: {
    checkedAt: string;
    alerts: ReconciliationAlert[];
    truncated: boolean;
    includesUnmatchedOnChainTransfers: boolean;
  };
  networkHealth: { checkedAt: string; staleAfterSeconds: number; networks: NetworkScanHealth[] };
  summary: { total: number; paid: number; active: number; attention: number };
  networkStates: ScanState[];
  invoices: Invoice[];
  transactions: Transaction[];
  events: PaymentEvent[];
}
interface Preflight {
  networks: Array<{ network: PaymentNetwork; ok: boolean; assetDecimals?: number; error?: string }>;
}
interface ScanResult {
  networks: Array<{ network: PaymentNetwork; ok: boolean; error?: string }>;
}
const NETWORKS: PaymentNetwork[] = ["bsc", "ethereum", "ton"];
const NETWORK_NAMES: Record<PaymentNetwork, string> = {
  bsc: "BNB Smart Chain",
  ethereum: "Ethereum",
  ton: "TON",
};

function StatusPill({ state, label }: { state: "good" | "warn" | "neutral"; label: string }) {
  const className = state === "good"
    ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
    : state === "warn"
      ? "bg-amber-50 text-amber-700 ring-amber-100"
      : "bg-slate-100 text-slate-600 ring-slate-200";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${className}`}>{label}</span>;
}
const compact = (value: string, length = 14) =>
  value.length > length ? `${value.slice(0, 9)}…${value.slice(-5)}` : value;

export default function CryptoPayments({ token }: { token: string }) {
  const { t, i18n } = useTranslation("system");
  const locale = normalizeAppLocale(i18n.language);
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [notificationStatus, setNotificationStatus] = useState<NotificationStatus | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [busy, setBusy] = useState<Operation | "refresh" | null>("refresh");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const date = (value?: string | null) => {
    if (!value) return t("payments.notYet");
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? t("payments.notYet")
      : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(parsed);
  };
  const request = useCallback(async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`/api/crypto-payments/${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...options.headers },
      cache: "no-store",
    });
    const data = await safeResponseJson(response);
    if (!response.ok) {
      const failure = new Error(data?.error || `HTTP ${response.status}`) as Error & { code?: string };
      if (typeof data?.code === "string") failure.code = data.code;
      throw failure;
    }
    return data;
  }, [token]);

  const reload = useCallback(async (signal?: AbortSignal) => {
    const [nextStatus, nextOverview, nextNotifications] = await Promise.all([
      request("status", { signal }),
      request("overview", { signal }),
      request("notifications/status", { signal }).catch(() => null),
    ]);
    if (!signal?.aborted) {
      setStatus(nextStatus);
      setOverview(nextOverview);
      setNotificationStatus(nextNotifications);
    }
  }, [request]);

  useEffect(() => {
    const controller = new AbortController();
    setStatus(null);
    setNotificationStatus(null);
    setOverview(null);
    setPreflight(null);
    setBusy("refresh");
    setError("");
    void reload(controller.signal).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : t("payments.requestFailed"));
    }).finally(() => { if (!controller.signal.aborted) setBusy(null); });
    return () => controller.abort();
  }, [reload, t]);

  // Poll only while this privileged workspace is mounted and visible.
  // The polling controller is cancelled on logout, account switching, or unmount.
  useEffect(() => {
    const controller = new AbortController();
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void reload(controller.signal).catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : t("payments.requestFailed"));
        }
      });
    }, 60_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [reload, t]);

  const execute = async (action: Operation | "refresh") => {
    if (busy) return;
    setBusy(action);
    setError("");
    setNotice("");
    try {
      if (action === "refresh") {
        await reload();
      } else if (action === "notification-test") {
        await request("notifications/test", { method: "POST" });
        setNotice(t("payments.telegramSetup.testSuccess"));
      } else if (action === "preflight") {
        const result: Preflight = await request("preflight", { method: "POST" });
        setPreflight(result);
        setNotice(t("payments.preflightFinished"));
      } else {
        const result: ScanResult = await request("scan", { method: "POST" });
        const failures = result.networks.filter(network => !network.ok);
        if (failures.length) {
          setNotice(t("payments.scanPartial"));
        } else {
          setNotice(t("payments.scanFinished"));
        }
        await reload();
      }
    } catch (reason) {
      const code = reason instanceof Error && "code" in reason && typeof reason.code === "string"
        ? reason.code : null;
      const fallback = reason instanceof Error ? reason.message : t("payments.requestFailed");
      setError(action === "notification-test" && code?.startsWith("TEST_")
        ? t(`payments.telegramSetup.errors.${code}`, { defaultValue: fallback })
        : fallback);
    } finally {
      setBusy(null);
    }
  };

  const reconciliationAlerts = overview?.reconciliation.alerts ?? [];
  const criticalAlerts = reconciliationAlerts.filter(alert => alert.severity === "critical").length;
  const summary = overview?.summary;
  const metrics = [
    { key: "total", label: t("payments.totalInvoices"), value: summary?.total ?? 0, icon: CreditCard },
    { key: "paid", label: t("payments.paidInvoices"), value: summary?.paid ?? 0, icon: CheckCircle2 },
    { key: "active", label: t("payments.activeInvoices"), value: summary?.active ?? 0, icon: Clock3 },
    { key: "attention", label: t("payments.needsAttention"), value: summary?.attention ?? 0, icon: AlertTriangle },
  ];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-lg bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-700">
            <ShieldCheck className="h-4 w-4" /> {t("payments.adminOnly")}
          </div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-slate-950">{t("payments.title")}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{t("payments.description")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!!busy} onClick={() => void execute("refresh")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${busy === "refresh" ? "animate-spin" : ""}`} /> {t("payments.refresh")}
          </button>
          <button type="button" disabled={!!busy} onClick={() => void execute("preflight")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <SearchCheck className="h-4 w-4" /> {t("payments.preflight")}
          </button>
          <button type="button" disabled={!!busy || !status?.enabled} onClick={() => void execute("scan")} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
            <Activity className="h-4 w-4" /> {t("payments.scanNow")}
          </button>
        </div>
      </div>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">{notice}</div>}
      {!overview && busy === "refresh" && <div role="status" className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{t("payments.loading")}</div>}
      {notificationStatus && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" aria-label={t("payments.telegramSetup.title")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display text-lg font-bold text-slate-900">{t("payments.telegramSetup.title")}</h3>
            <StatusPill
              state={notificationStatus.telegramDeliveryEnabled ? "good" : "neutral"}
              label={notificationStatus.telegramDeliveryEnabled
                ? t("payments.telegramSetup.autoOn")
                : t("payments.telegramSetup.autoOff")}
            />
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">{t("payments.telegramSetup.description")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <StatusPill state={notificationStatus.journalEnabled ? "good" : "warn"}
              label={t(notificationStatus.journalEnabled ? "payments.telegramSetup.journalOn" : "payments.telegramSetup.journalOff")}/>
            <StatusPill state={notificationStatus.tokenPresent ? "good" : "warn"}
              label={t(notificationStatus.tokenPresent ? "payments.telegramSetup.botSet" : "payments.telegramSetup.botMissing")}/>
            <StatusPill state={notificationStatus.chatPresent ? "good" : "warn"}
              label={t(notificationStatus.chatPresent ? "payments.telegramSetup.chatSet" : "payments.telegramSetup.chatMissing")}/>
          </div>
          <button
            type="button"
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            disabled={!!busy || !notificationStatus.readyForTest}
            onClick={() => {
              if (window.confirm(t("payments.telegramSetup.confirm"))) {
                void execute("notification-test");
              }
            }}
          >
            <CheckCircle2 className="h-4 w-4" /> {t("payments.telegramSetup.testButton")}
          </button>
          <p className="mt-3 text-xs leading-5 text-slate-500">{t("payments.telegramSetup.instructions")}</p>
        </section>
      )}
      {overview && <>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label={t("payments.alertJournal.title")}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <h3 className="font-display text-lg font-bold text-slate-900">{t("payments.alertJournal.title")}</h3>
            <StatusPill state="neutral" label={t("payments.alertJournal.count", { count: overview.persistedAlerts.length })}/>
          </div>
          <p className="px-5 pt-3 text-xs text-slate-500">{t("payments.alertJournal.description")}</p>
          {overview.persistedAlerts.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">{t("payments.alertJournal.none")}</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {overview.persistedAlerts.map((alert) => (
                <div key={alert.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {NETWORK_NAMES[alert.network]} · {t(`payments.alerts.codes.${alert.code}`, { defaultValue: alert.code.replaceAll("_", " ") })}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {t("payments.alertJournal.lastSeen")}: {date(alert.last_seen_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusPill state={alert.status === "open" ? "warn" : "good"}
                      label={t(`payments.alertJournal.states.${alert.status}`)}/>
                    <StatusPill state="neutral"
                      label={t(`payments.alertJournal.delivery.${alert.notification_state}`)}/>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label={t("payments.unassigned.title")}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <h3 className="font-display text-lg font-bold text-slate-900">{t("payments.unassigned.title")}</h3>
            </div>
            <StatusPill state={overview.unassignedTransfers.items.length ? "warn" : "good"}
              label={t("payments.unassigned.count", { count: overview.unassignedTransfers.items.length })}/>
          </div>
          <p className="px-5 pt-3 text-xs leading-5 text-slate-500">{t("payments.unassigned.description")}</p>
          {overview.unassignedTransfers.items.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">{t("payments.unassigned.none")}</p>
          ) : <div className="divide-y divide-slate-100">
            {overview.unassignedTransfers.items.map((item) => (
              <div key={`${item.network}:${item.tx_hash}:${item.event_index}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {NETWORK_NAMES[item.network]} · <span dir="ltr">{item.amount} USDT</span>
                  </p>
                  <p className="mt-1 font-mono text-xs text-slate-500" dir="ltr" title={item.tx_hash}>
                    {compact(item.tx_hash, 28)} · #{item.event_index}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {t("payments.unassigned.lastSeen")}: {date(item.last_seen_at)} · {item.confirmations} {t("payments.confirmations")}
                  </p>
                </div>
                <StatusPill state="warn" label={t(`payments.unassigned.reasons.${item.reason}`)}/>
              </div>
            ))}
          </div>}
          {overview.unassignedTransfers.truncated && <p role="status" className="px-5 pb-4 text-sm text-amber-700">{t("payments.unassigned.truncated")}</p>}
          <p className="border-t border-slate-100 px-5 py-3 text-xs leading-5 text-slate-500">{t("payments.unassigned.scope")}</p>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" aria-label={t("payments.alerts.title")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className={`h-5 w-5 ${reconciliationAlerts.length ? "text-amber-600" : "text-emerald-600"}`} aria-hidden="true" />
              <h3 className="font-display text-lg font-bold text-slate-900">{t("payments.alerts.title")}</h3>
            </div>
            <StatusPill
              state={reconciliationAlerts.length ? "warn" : "good"}
              label={t("payments.alerts.count", { count: reconciliationAlerts.length })}
            />
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            {t("payments.alerts.description")} {t("payments.alerts.lastChecked")}: {date(overview.reconciliation.checkedAt)}
          </p>
          {criticalAlerts > 0 && <p className="mt-3 text-sm font-semibold text-rose-700" role="status">
            {t("payments.alerts.critical", { count: criticalAlerts })}
          </p>}
          {reconciliationAlerts.length === 0 ? (
            <p className="mt-4 text-sm font-medium text-emerald-700">{t("payments.alerts.none")}</p>
          ) : (
            <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100">
              {reconciliationAlerts.map((alert, index) => (
                <div key={`${alert.code}-${alert.invoiceId ?? alert.network}-${index}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-slate-900">{t(`payments.alerts.codes.${alert.code}`)}</p>
                    <p className="text-xs text-slate-500">
                      {NETWORK_NAMES[alert.network]}
                      {alert.invoiceId && <> · {t("payments.invoice")}: <span dir="ltr" className="font-mono" title={alert.invoiceId}>{compact(alert.invoiceId)}</span></>}
                      {alert.ownerPrincipal && <> · {t("payments.owner")}: <span dir="ltr" className="font-mono" title={alert.ownerPrincipal}>{compact(alert.ownerPrincipal, 24)}</span></>}
                    </p>
                  </div>
                  <StatusPill
                    state={alert.severity === "critical" ? "warn" : "neutral"}
                    label={t(`payments.alerts.severity.${alert.severity}`)}
                  />
                </div>
              ))}
            </div>
          )}
          {overview.reconciliation.truncated && (
            <p role="status" className="mt-3 text-sm text-amber-700">{t("payments.alerts.truncated")}</p>
          )}
          <p className="mt-3 text-xs leading-5 text-slate-500">{t("payments.alerts.scope")}</p>
        </section>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {metrics.map(metric => <div key={metric.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <metric.icon className="h-5 w-5 text-sky-600" />
            <p className="mt-3 text-xs font-semibold text-slate-500">{metric.label}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-slate-950">{new Intl.NumberFormat(locale).format(metric.value)}</p>
          </div>)}
        </div>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="font-display text-lg font-bold text-slate-900">{t("payments.networkHealth")}</h3>
            <StatusPill state={status?.enabled ? "good" : "warn"} label={status?.enabled ? t("payments.scanningEnabled") : t("payments.scanningDisabled")} />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {NETWORKS.map(network => {
              const config = status?.networks.find(item => item.id === network);
              const scan = overview.networkHealth.networks.find(item => item.network === network);
              const check = preflight?.networks.find(item => item.network === network);
              return <div key={network} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">{NETWORK_NAMES[network]}</p>
                  <StatusPill state={config ? "good" : "neutral"} label={config ? t("payments.enabled") : t("payments.disabled")} />
                </div>
                <p className="mt-3 text-xs text-slate-500">{t("payments.lastScan")}</p>
                <p className="mt-1 text-sm font-semibold text-slate-700">{date(scan?.lastScannedAt)}</p>
                {scan && <div className="mt-2"><StatusPill
                  state={scan.state === "recent" ? "good" : scan.state === "disabled" ? "neutral" : "warn"}
                  label={t(`payments.scanHealth.${scan.state}`)}
                /></div>}
                {scan?.state === "stale" && <p className="mt-2 text-xs font-semibold text-amber-700" role="status">{t("payments.staleHint", { seconds: overview.networkHealth.staleAfterSeconds })}</p>}
                {config && <p className="mt-2 text-xs text-slate-500">{t("payments.requiredConfirmations")}: {config.requiredConfirmations}</p>}
                {check && <div className="mt-3"><StatusPill state={check.ok ? "good" : "warn"} label={check.ok ? `${t("payments.preflightPassed")} · ${check.assetDecimals ?? "?"} ${t("payments.decimals")}` : t("payments.preflightFailed")} /></div>}
              </div>;
            })}
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">{t("payments.readOnlyNote")} {t("payments.healthDisclaimer")}</p>
        </section>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4"><Wallet className="h-5 w-5 text-sky-600" /><h3 className="font-display text-lg font-bold text-slate-900">{t("payments.recentInvoices")}</h3></div>
          <div className="overflow-x-auto"><table className="min-w-[770px] w-full text-start text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500"><tr>
              {[t("payments.invoice"), t("payments.owner"), t("payments.network"), t("payments.amount"), t("payments.status"), t("payments.created")].map(h => <th key={h} className="px-5 py-3 text-start">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-slate-100">{overview.invoices.map(invoice => <tr key={invoice.id}>
              <td className="px-5 py-3 font-mono text-xs text-slate-700" title={invoice.id}>{compact(invoice.id)}</td>
              <td className="px-5 py-3 font-mono text-xs text-slate-500" title={invoice.owner_principal}>{compact(invoice.owner_principal, 24)}</td>
              <td className="px-5 py-3 font-medium text-slate-700">{NETWORK_NAMES[invoice.network]}</td>
              <td className="px-5 py-3 font-semibold tabular-nums text-slate-900" dir="ltr">{invoice.expected_amount} USDT</td>
              <td className="px-5 py-3"><StatusPill state={invoice.status === "paid" ? "good" : ["failed","underpaid","overpaid","expired"].includes(invoice.status) ? "warn" : "neutral"} label={t(`payments.states.${invoice.status}`, { defaultValue: invoice.status })} /></td>
              <td className="px-5 py-3 text-xs text-slate-500">{date(invoice.created_at)}</td>
            </tr>)}</tbody>
          </table></div>
          {!overview.invoices.length && <p className="p-6 text-sm text-slate-500">{t("payments.noInvoices")}</p>}
        </section>
        <div className="grid gap-5 xl:grid-cols-2">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4"><DatabaseZap className="h-5 w-5 text-sky-600" /><h3 className="font-display text-lg font-bold">{t("payments.recentTransfers")}</h3></div>
            <div className="divide-y divide-slate-100">
              {overview.transactions.map(tx => <div key={tx.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0"><p className="text-sm font-semibold text-slate-900">{NETWORK_NAMES[tx.network]} · {tx.amount} USDT</p><p className="mt-1 truncate font-mono text-xs text-slate-500" title={tx.tx_hash}>{compact(tx.tx_hash, 28)}</p></div>
                <div className="shrink-0 text-end"><StatusPill state={tx.status === "confirmed" ? "good" : "neutral"} label={tx.status} /><p className="mt-1 text-xs text-slate-500">{tx.confirmations} {t("payments.confirmations")}</p></div>
              </div>)}
              {!overview.transactions.length && <p className="p-5 text-sm text-slate-500">{t("payments.noTransfers")}</p>}
            </div>
          </section>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4"><Activity className="h-5 w-5 text-sky-600" /><h3 className="font-display text-lg font-bold">{t("payments.auditTrail")}</h3></div>
            <div className="divide-y divide-slate-100">
              {overview.events.map(event => <div key={event.id} className="flex justify-between gap-3 px-5 py-3">
                <div className="min-w-0"><p className="text-sm font-semibold text-slate-800">{event.event_type.replaceAll("_", " ")}</p><p className="mt-1 truncate font-mono text-xs text-slate-500" title={event.owner_principal}>{compact(event.owner_principal, 26)}</p></div>
                <p className="shrink-0 text-xs text-slate-500">{date(event.occurred_at)}</p>
              </div>)}
              {!overview.events.length && <p className="p-5 text-sm text-slate-500">{t("payments.noEvents")}</p>}
            </div>
          </section>
        </div>
      </>}
    </div>
  );
}
