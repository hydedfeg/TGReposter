import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  HardDrive,
  Layers3,
  RefreshCw,
  Server,
  ShieldCheck,
  Table2,
} from "lucide-react";
import { safeResponseJson } from "../utils/api";

interface RuntimeTableStatus {
  name: string;
  ready: boolean;
  kind: "tenant" | "system";
}

interface CronJobStatus {
  name: string;
  schedule: string;
  active: boolean;
  lastStatus?: string;
  lastRunAt?: string;
  lastReturnMessage?: string;
}

interface DatabaseStatus {
  configured: boolean;
  hasDirectDbUrl: boolean;
  supabaseUrl: string;
  backendMode: "normalized-postgres" | "unavailable";
  runtime: {
    ready: boolean;
    readyCount: number;
    requiredCount: number;
    tables: RuntimeTableStatus[];
  };
  tenancy: {
    ready: boolean;
    ownerScopedCount: number;
    expectedCount: number;
    orphanRows: number;
  };
  automation: {
    ready: boolean;
    pgCronInstalled: boolean;
    pgNetInstalled: boolean;
    jobs: CronJobStatus[];
  };
  security: {
    ready: boolean;
    protectedCount: number;
    expectedCount: number;
  };
  error?: string;
}

const tableLabels: Record<string, string> = {
  source_channels: "User Sources",
  filters: "User Filters",
  destination_targets: "User Destinations",
  ai_settings: "User AI Configuration",
  user_inbox_items: "User Content Inbox",
  telegram_bot_accounts: "User Promotion Bots",
  promotion_targets: "User Promotion Targets",
  promotion_campaigns: "User Promotion Campaigns",
  promotion_campaign_posts: "User Campaign Posts",
  promotion_deliveries: "User Promotion Deliveries",
  promotion_delivery_attempts: "User Delivery Attempts",
  posts: "Internal Ingestion Cache",
  curator_settings: "Legacy Auth Compatibility",
};

function formatSchedule(schedule: string) {
  if (schedule === "*/5 * * * *") return "Every 5 minutes";
  if (schedule === "0 * * * *") return "Every hour";
  return schedule;
}

function formatJobName(name: string) {
  if (name === "tgreposter-inbox-import") return "User Source Synchronization";
  if (name === "tgreposter-inbox-cleanup") return "Ingestion Cache Cleanup";
  return name;
}

function formatLastRun(value?: string) {
  if (!value) return "No run recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function HealthBadge({
  healthy,
  healthyText,
  unhealthyText,
}: {
  healthy: boolean;
  healthyText: string;
  unhealthyText: string;
}) {
  return healthy ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
      {healthyText}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
      {unhealthyText}
    </span>
  );
}

export default function DatabaseConfig() {
  const [status, setStatus] = useState<DatabaseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/supabase/status", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("curator_token") || ""}`,
        },
      });

      if (!response.ok) {
        const body = await safeResponseJson(response).catch(() => null);
        throw new Error(body?.error || "Failed to fetch system status.");
      }

      setStatus(await safeResponseJson(response));
    } catch (err: any) {
      setError(err?.message || "System health check failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  if (loading && !status) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-10">
        <RefreshCw className="mb-3 h-8 w-8 animate-spin text-sky-500" aria-hidden="true" />
        <p className="text-sm font-medium text-slate-500">
          Checking infrastructure and tenant isolation...
        </p>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 rounded-2xl border border-slate-200 bg-white p-10 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-500" aria-hidden="true" />
        <div>
          <h3 className="font-display text-base font-bold text-slate-800">
            System health unavailable
          </h3>
          <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">{error}</p>
        </div>
        <button
          type="button"
          onClick={fetchStatus}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-100 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-200"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  }

  const health = status!;
  const cards = [
    {
      label: "Backend",
      title: "PostgreSQL Runtime",
      icon: Server,
      healthy:
        health.configured &&
        health.hasDirectDbUrl &&
        health.backendMode === "normalized-postgres",
      ok: "Connected",
      bad: "Unavailable",
    },
    {
      label: "Tenant Isolation",
      title: "Per-user Ownership",
      icon: Layers3,
      healthy: health.tenancy.ready,
      ok: "Fully isolated",
      bad: "Isolation incomplete",
    },
    {
      label: "Security",
      title: "Backend-owned Tables",
      icon: ShieldCheck,
      healthy: health.security.ready,
      ok: `${health.security.protectedCount}/${health.security.expectedCount} protected`,
      bad: `${health.security.protectedCount}/${health.security.expectedCount} protected`,
    },
    {
      label: "Automation",
      title: "User Sync Jobs",
      icon: Clock3,
      healthy: health.automation.ready,
      ok: "Active",
      bad: "Incomplete",
    },
  ];

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-indigo-600" aria-hidden="true" />
              <h2 className="font-display text-lg font-bold text-slate-950">
                Infrastructure & Isolation Health
              </h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              System Settings contains infrastructure diagnostics only. TGReposter has
              no shared user application configuration: every member owns their own
              Sources, Filters, AI configuration, Content Inbox, Destinations,
              Promotions, publishing history, and dashboard data.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-800">
            <ShieldCheck className="h-5 w-5 text-indigo-600" aria-hidden="true" />
            Super-Admin infrastructure only
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {cards.map(card => {
            const Icon = card.icon;
            return (
              <article key={card.label} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-600 shadow-sm ring-1 ring-slate-100">
                  <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                </div>
                <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {card.label}
                </p>
                <h3 className="mt-1 text-sm font-bold text-slate-800">{card.title}</h3>
                <div className="mt-4">
                  <HealthBadge healthy={card.healthy} healthyText={card.ok} unhealthyText={card.bad} />
                </div>
              </article>
            );
          })}
        </div>

        {(health.error || error) ? (
          <div className="mt-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
            <div>
              <p className="text-sm font-bold">System health notice</p>
              <p className="mt-1 text-xs leading-5">{health.error || error}</p>
            </div>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-400">
            Supabase endpoint:{" "}
            <span className="font-medium text-slate-500">
              {health.supabaseUrl || "Not configured"}
            </span>
          </p>
          <button
            type="button"
            onClick={fetchStatus}
            disabled={loading}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh health
          </button>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-2">
            <Layers3 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            <h3 className="font-display text-base font-bold text-slate-950">
              Per-user Ownership Check
            </h3>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Application tables must carry a non-null server-derived owner key.
            This is a structural health check, not a view of another member&apos;s data.
          </p>

          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 p-4">
              <div>
                <p className="text-sm font-bold text-slate-800">Owner-scoped tables</p>
                <p className="mt-1 text-xs text-slate-500">
                  Sources, filters, AI, inbox, destinations, and promotions.
                </p>
              </div>
              <HealthBadge
                healthy={health.tenancy.ownerScopedCount === health.tenancy.expectedCount}
                healthyText={`${health.tenancy.ownerScopedCount}/${health.tenancy.expectedCount} ready`}
                unhealthyText={`${health.tenancy.ownerScopedCount}/${health.tenancy.expectedCount} ready`}
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 p-4">
              <div>
                <p className="text-sm font-bold text-slate-800">Unowned application rows</p>
                <p className="mt-1 text-xs text-slate-500">
                  Must be zero before the tenant model is considered healthy.
                </p>
              </div>
              <HealthBadge
                healthy={health.tenancy.orphanRows === 0}
                healthyText="0 unowned"
                unhealthyText={`${health.tenancy.orphanRows} unowned`}
              />
            </div>

            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 text-xs leading-5 text-emerald-800">
              A Super-Admin can administer accounts and infrastructure, but application
              configuration is not inherited, copied, or exposed between users.
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-sky-600" aria-hidden="true" />
            <h3 className="font-display text-base font-bold text-slate-950">
              Internal System Storage
            </h3>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            These are implementation details, not shared user workspaces.
          </p>

          <div className="mt-5 space-y-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
              <p className="text-sm font-bold text-slate-800">Telegram ingestion cache</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Raw Telegram fetches may be deduplicated internally for efficiency.
                A cached post is invisible to a user until that user&apos;s own source
                subscription and filter workflow explicitly assigns it to their inbox.
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
              <p className="text-sm font-bold text-slate-800">Authentication compatibility</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Legacy account bootstrap metadata is infrastructure-only and cannot
                store Sources, Filters, AI settings, Content Inbox, or publishing configuration.
              </p>
            </div>
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="border-b border-slate-100 p-5">
          <div className="flex items-center gap-2">
            <Table2 className="h-5 w-5 text-indigo-600" aria-hidden="true" />
            <h3 className="font-display text-base font-bold text-slate-950">
              Runtime Schema
            </h3>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Tenant tables contain user-owned application data. System tables are
            internal infrastructure only and are never presented as shared workspace data.
          </p>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {health.runtime.tables.map(table => (
            <div
              key={table.name}
              className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-bold text-slate-700">
                    {tableLabels[table.name] || table.name}
                  </p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    table.kind === "tenant"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-200 text-slate-600"
                  }`}>
                    {table.kind === "tenant" ? "User-owned" : "System internal"}
                  </span>
                </div>
                <p className="mt-1 truncate font-mono text-[10px] text-slate-400">
                  {table.name}
                </p>
              </div>
              {table.ready ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="border-b border-slate-100 p-5">
          <div className="flex items-center gap-2">
            <Clock3 className="h-5 w-5 text-sky-600" aria-hidden="true" />
            <h3 className="font-display text-base font-bold text-slate-950">
              Background Infrastructure
            </h3>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            The scheduler runs infrastructure jobs. Source synchronization is evaluated
            independently for each owner&apos;s source list and filters.
          </p>
        </div>

        <div className="space-y-3 p-5">
          <div className="flex flex-wrap gap-2">
            <HealthBadge
              healthy={health.automation.pgCronInstalled}
              healthyText="pg_cron installed"
              unhealthyText="pg_cron missing"
            />
            <HealthBadge
              healthy={health.automation.pgNetInstalled}
              healthyText="pg_net installed"
              unhealthyText="pg_net missing"
            />
          </div>

          {health.automation.jobs.length === 0 ? (
            <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-xs text-amber-800">
              No TGReposter infrastructure jobs were found.
            </div>
          ) : (
            health.automation.jobs.map(job => (
              <div key={job.name} className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-700">
                      {formatJobName(job.name)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatSchedule(job.schedule)}
                    </p>
                  </div>
                  <HealthBadge
                    healthy={job.active && job.lastStatus !== "failed"}
                    healthyText={job.lastStatus === "succeeded" ? "Succeeded" : "Active"}
                    unhealthyText={job.active ? "Last run failed" : "Disabled"}
                  />
                </div>
                <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                  Last run:{" "}
                  <span className="font-medium text-slate-600">
                    {formatLastRun(job.lastRunAt)}
                  </span>
                  {job.lastReturnMessage ? (
                    <span className="ml-2 text-slate-400">· {job.lastReturnMessage}</span>
                  ) : null}
                </p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-bold text-emerald-950">
              No shared application data
            </h3>
            <p className="mt-1 text-xs leading-5 text-emerald-800">
              Tenant ownership is derived on the backend. Browser clients cannot select
              another owner, and user application data is accessed only through the
              authenticated owner&apos;s repositories and routes.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
