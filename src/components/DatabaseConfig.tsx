import React, { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  RefreshCw,
  Server,
  ShieldCheck,
  Table2,
} from "lucide-react";
import { safeResponseJson } from "../utils/api";

interface RuntimeTableStatus {
  name: string;
  ready: boolean;
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
  counts: {
    sourceChannels: number;
    destinationTargets: number;
    inboxPosts: number;
    postedPosts: number;
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
  source_channels: "Source Channels",
  filters: "Filters",
  destination_targets: "Destinations",
  ai_settings: "AI Settings",
  posts: "Posts",
  curator_settings: "Compatibility Settings",
};

function formatSchedule(schedule: string) {
  if (schedule === "*/5 * * * *") return "Every 5 minutes";
  if (schedule === "0 * * * *") return "Every hour";
  return schedule;
}

function formatJobName(name: string) {
  if (name === "tgreposter-inbox-import") return "Inbox Import";
  if (name === "tgreposter-inbox-cleanup") return "24h Cleanup";
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
    <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
      <span>{healthyText}</span>
    </div>
  ) : (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
      <span>{unhealthyText}</span>
    </div>
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
        const text = await response.text();
        throw new Error(text || "Failed to fetch database status");
      }

      const data = await safeResponseJson(response);
      setStatus(data);
    } catch (err: any) {
      setError(err?.message || "Database health check failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  if (loading && !status) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-8">
        <RefreshCw className="mb-3 h-8 w-8 animate-spin text-sky-500" />
        <p className="text-sm text-slate-500">Checking backend database health...</p>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-500" />
        <div>
          <h3 className="font-display text-base font-bold text-slate-800">Database health unavailable</h3>
          <p className="mt-1 max-w-md text-xs text-slate-500">{error}</p>
        </div>
        <button
          onClick={fetchStatus}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    );
  }

  const health = status!;

  const overviewCards = [
    {
      label: "Backend Runtime",
      title: "Normalized PostgreSQL",
      icon: Server,
      healthy: health.configured && health.hasDirectDbUrl && health.backendMode === "normalized-postgres",
      healthyText: "Direct DB active",
      unhealthyText: "Backend unavailable",
    },
    {
      label: "Schema Health",
      title: "Runtime Tables",
      icon: Table2,
      healthy: health.runtime.ready,
      healthyText: `${health.runtime.readyCount}/${health.runtime.requiredCount} ready`,
      unhealthyText: `${health.runtime.readyCount}/${health.runtime.requiredCount} ready`,
    },
    {
      label: "Automation",
      title: "Inbox Jobs",
      icon: Clock3,
      healthy: health.automation.ready,
      healthyText: "2 jobs active",
      unhealthyText: "Automation incomplete",
    },
    {
      label: "Security",
      title: "Backend-Owned Tables",
      icon: ShieldCheck,
      healthy: health.security.ready,
      healthyText: `${health.security.protectedCount}/${health.security.expectedCount} protected`,
      unhealthyText: "Protection incomplete",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-3xs">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-slate-800">Database & Backend Health</h3>
              <p className="text-xs text-slate-500">Live status from the normalized Supabase PostgreSQL runtime.</p>
            </div>
          </div>
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            title="Refresh database status"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="space-y-6 p-6">
          {(health.error || error) && (
            <div className="flex gap-2.5 rounded-xl border border-amber-100 bg-amber-50 p-4 text-amber-900">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div>
                <p className="text-sm font-bold">Health check notice</p>
                <p className="mt-0.5 text-xs leading-relaxed">{health.error || error}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {overviewCards.map(card => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="flex flex-col justify-between rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                  <div>
                    <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-600 shadow-sm ring-1 ring-slate-100">
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{card.label}</p>
                    <h4 className="mt-1 text-sm font-bold text-slate-700">{card.title}</h4>
                  </div>
                  <div className="mt-4">
                    <HealthBadge
                      healthy={card.healthy}
                      healthyText={card.healthyText}
                      unhealthyText={card.unhealthyText}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
            <div className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
              <div>
                <h4 className="text-sm font-bold text-emerald-900">Migration-managed database</h4>
                <p className="mt-1 text-xs leading-relaxed text-emerald-800/90">
                  Runtime configuration now lives in normalized PostgreSQL tables and is accessed through the backend.
                  Schema changes are managed by versioned Supabase migrations. The legacy <code>curator_settings</code> row remains only as a compatibility layer for data not migrated yet.
                </p>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-400">
            Supabase project endpoint: <span className="font-medium text-slate-500">{health.supabaseUrl || "Not configured"}</span>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-3xs">
        <div className="border-b border-slate-100 bg-slate-50/50 p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-sky-50 p-2 text-sky-600">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-slate-800">Runtime Data</h3>
              <p className="text-xs text-slate-500">Current backend-owned records and the rolling inbox window.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px bg-slate-100 md:grid-cols-4">
          {[
            ["Source Channels", health.counts.sourceChannels],
            ["Destinations", health.counts.destinationTargets],
            ["Inbox · 24h", health.counts.inboxPosts],
            ["Published", health.counts.postedPosts],
          ].map(([label, value]) => (
            <div key={String(label)} className="bg-white p-5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
              <p className="mt-2 text-2xl font-bold text-slate-800">{value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-3xs">
          <div className="border-b border-slate-100 bg-slate-50/50 p-5">
            <h3 className="font-display text-base font-bold text-slate-800">Runtime Tables</h3>
            <p className="mt-0.5 text-xs text-slate-500">Required backend tables for collection, filtering, AI, destinations, and compatibility.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
            {health.runtime.tables.map(table => (
              <div key={table.name} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3">
                <div>
                  <p className="text-xs font-semibold text-slate-700">{tableLabels[table.name] || table.name}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-slate-400">{table.name}</p>
                </div>
                {table.ready ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-3xs">
          <div className="border-b border-slate-100 bg-slate-50/50 p-5">
            <h3 className="font-display text-base font-bold text-slate-800">Inbox Automation</h3>
            <p className="mt-0.5 text-xs text-slate-500">Supabase Cron and pg_net jobs managed by backend migrations.</p>
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
                No TGReposter inbox jobs were found.
              </div>
            ) : (
              health.automation.jobs.map(job => (
                <div key={job.name} className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-700">{formatJobName(job.name)}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{formatSchedule(job.schedule)}</p>
                    </div>
                    <HealthBadge
                      healthy={job.active && job.lastStatus !== "failed"}
                      healthyText={job.lastStatus === "succeeded" ? "Succeeded" : "Active"}
                      unhealthyText={job.active ? "Last run failed" : "Disabled"}
                    />
                  </div>
                  <div className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                    Last run: <span className="font-medium text-slate-600">{formatLastRun(job.lastRunAt)}</span>
                    {job.lastReturnMessage && (
                      <span className="ml-2 text-slate-400">· {job.lastReturnMessage}</span>
                    )}
                  </div>
                </div>
              ))
            )}

            <div className="rounded-xl border border-slate-100 bg-white p-4 text-xs leading-relaxed text-slate-500">
              Browser roles have no direct DML access to the six backend-owned runtime tables. All sensitive writes remain server-side.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
