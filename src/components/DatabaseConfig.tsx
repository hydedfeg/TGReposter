import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  Database,
  Inbox,
  Layers3,
  RefreshCw,
  Server,
  ShieldCheck,
  Table2,
  Users,
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
    userInboxItems: number;
  };
  workspace: {
    ready: boolean;
    applicationOwnershipReady: boolean;
    destinationOwnershipReady: boolean;
    inboxIsolationReady: boolean;
    sourceOwners: number;
    postOwners: number;
    destinationOwners: number;
    unownedApplicationRows: number;
    unownedDestinationTargets: number;
    inboxOwners: number;
    activeSupabaseUsers: number;
    legacyUsers: number;
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
  source_channels: "Personal Sources",
  filters: "Personal Filters",
  destination_targets: "Personal Destinations",
  ai_settings: "Personal AI Settings",
  posts: "Personal Monitored Posts",
  user_inbox_items: "Personal Inbox State",
  curator_settings: "Legacy Compatibility",
};

const tableScopes: Record<string, "Personal" | "Compatibility"> = {
  source_channels: "Personal",
  filters: "Personal",
  destination_targets: "Personal",
  ai_settings: "Personal",
  posts: "Personal",
  user_inbox_items: "Personal",
  curator_settings: "Compatibility",
};

function formatSchedule(schedule: string) {
  if (schedule === "*/5 * * * *") return "Every 5 minutes";
  if (schedule === "0 * * * *") return "Every hour";
  return schedule;
}

function formatJobName(name: string) {
  if (name === "tgreposter-inbox-import") return "Source Inbox Import";
  if (name === "tgreposter-inbox-cleanup") return "Rolling Inbox Cleanup";
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

function Metric({
  label,
  value,
  helper,
}: {
  label: string;
  value: number | string;
  helper?: string;
}) {
  return (
    <div className="bg-white p-5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      {helper ? <p className="mt-1 text-xs text-slate-500">{helper}</p> : null}
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
          Checking per-user application data isolation...
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

  const overviewCards = [
    {
      label: "Backend Runtime",
      title: "Normalized PostgreSQL",
      icon: Server,
      healthy:
        health.configured &&
        health.hasDirectDbUrl &&
        health.backendMode === "normalized-postgres",
      healthyText: "Backend active",
      unhealthyText: "Backend unavailable",
    },
    {
      label: "Multi-user Architecture",
      title: "Workspace Isolation",
      icon: Layers3,
      healthy: health.workspace.ready,
      healthyText: "Personal data isolated",
      unhealthyText: "Cutover incomplete",
    },
    {
      label: "Automation",
      title: "Collection & Cleanup",
      icon: Clock3,
      healthy: health.automation.ready,
      healthyText: "Jobs active",
      unhealthyText: "Automation incomplete",
    },
    {
      label: "Data Security",
      title: "Backend-Owned Tables",
      icon: ShieldCheck,
      healthy: health.security.ready,
      healthyText: `${health.security.protectedCount}/${health.security.expectedCount} protected`,
      unhealthyText: `${health.security.protectedCount}/${health.security.expectedCount} protected`,
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
                System Architecture & Health
              </h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              This page is system-wide and Super-Admin only. It verifies that every
              application record—including sources, filters, AI preferences, monitored
              posts, Inbox state, and destinations—is owned by one member. Credentials
              remain managed from each member&apos;s My Destinations workspace.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-800">
            <ShieldCheck className="h-5 w-5 text-indigo-600" aria-hidden="true" />
            System administration scope
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {overviewCards.map((card) => {
            const Icon = card.icon;
            return (
              <article
                key={card.label}
                className="rounded-xl border border-slate-100 bg-slate-50/60 p-4"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-600 shadow-sm ring-1 ring-slate-100">
                  <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                </div>
                <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {card.label}
                </p>
                <h3 className="mt-1 text-sm font-bold text-slate-800">{card.title}</h3>
                <div className="mt-4">
                  <HealthBadge
                    healthy={card.healthy}
                    healthyText={card.healthyText}
                    unhealthyText={card.unhealthyText}
                  />
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

        {!health.workspace.applicationOwnershipReady ? (
          <div className="mt-5 flex gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 text-violet-900">
            <Layers3 className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" aria-hidden="true" />
            <div>
              <p className="text-sm font-bold">Full application ownership cutover pending</p>
              <p className="mt-1 text-xs leading-5 text-violet-800">
                A coordinated database and backend release is still required before every
                source, filter, AI setting, monitored post, Inbox item, and destination is
                structurally required to have an owner.
              </p>
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
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            Refresh health
          </button>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="border-b border-slate-100 p-5">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-sky-600" aria-hidden="true" />
              <h3 className="font-display text-base font-bold text-slate-950">
                Personal Monitoring Data
              </h3>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Sources and crawled Telegram posts are stored separately for each member,
              even when two members monitor the same public channel.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-px bg-slate-100">
            <Metric
              label="Source Channels"
              value={health.counts.sourceChannels}
              helper={`${health.workspace.sourceOwners} owner(s)`}
            />
            <Metric
              label="Monitored Posts · 24h"
              value={health.counts.inboxPosts}
              helper={`${health.workspace.postOwners} owner(s)`}
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="border-b border-slate-100 p-5">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              <h3 className="font-display text-base font-bold text-slate-950">
                Personal Workspace Data
              </h3>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Inbox workflow and publishing configuration are also separated by ownership
              principal. Counts below are aggregate system health metrics only.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-3">
            <Metric
              label="Destination Targets"
              value={health.counts.destinationTargets}
              helper={`${health.workspace.destinationOwners} owner(s)`}
            />
            <Metric
              label="Inbox Workflow Rows"
              value={health.counts.userInboxItems}
              helper={`${health.workspace.inboxOwners} owner(s)`}
            />
            <Metric
              label="Published Workflow"
              value={health.counts.postedPosts}
              helper="Per-user publish states"
            />
            <Metric
              label="Supabase Members"
              value={health.workspace.activeSupabaseUsers}
              helper="Active durable identities"
            />
            <Metric
              label="Legacy Members"
              value={health.workspace.legacyUsers}
              helper="Username-owned workspaces"
            />
            <Metric
              label="Unowned App Rows"
              value={health.workspace.unownedApplicationRows}
              helper="Should remain 0"
            />
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="border-b border-slate-100 p-5">
          <div className="flex items-center gap-2">
            <Table2 className="h-5 w-5 text-indigo-600" aria-hidden="true" />
            <h3 className="font-display text-base font-bold text-slate-950">
              Runtime Data Boundaries
            </h3>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            All application tables are personal. Only the legacy compatibility record is
            system-level, and browser clients do not receive direct database write access.
          </p>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {health.runtime.tables.map((table) => {
            const scope = tableScopes[table.name] || "Personal";
            return (
              <div
                key={table.name}
                className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-bold text-slate-700">
                      {tableLabels[table.name] || table.name}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        scope === "Personal"
                          ? "bg-emerald-50 text-emerald-700"
                          : scope === "Compatibility"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-sky-50 text-sky-700"
                      }`}
                    >
                      {scope}
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
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="border-b border-slate-100 p-5">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              <h3 className="font-display text-base font-bold text-slate-950">
                Workspace Isolation Checks
              </h3>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              These checks verify that no application data can exist outside a member
              workspace.
            </p>
          </div>

          <div className="space-y-3 p-5">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 p-4">
              <div>
                <p className="text-sm font-bold text-slate-800">
                  Complete application ownership
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Sources, filters, AI settings, posts, and destinations require an owner.
                </p>
              </div>
              <HealthBadge
                healthy={health.workspace.applicationOwnershipReady}
                healthyText="Ready"
                unhealthyText="Missing"
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 p-4">
              <div>
                <p className="text-sm font-bold text-slate-800">
                  Content Inbox isolation
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Review/edit/publish state joins only to posts owned by the same member.
                </p>
              </div>
              <HealthBadge
                healthy={health.workspace.inboxIsolationReady}
                healthyText="Ready"
                unhealthyText="Cutover pending"
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 p-4">
              <div>
                <p className="text-sm font-bold text-slate-800">
                  Orphan application-data check
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Every production application row should have an owner.
                </p>
              </div>
              <HealthBadge
                healthy={health.workspace.unownedApplicationRows === 0}
                healthyText="No orphans"
                unhealthyText={`${health.workspace.unownedApplicationRows} unowned`}
              />
            </div>

            <div className="rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">
              <Inbox className="mr-1 inline h-4 w-4 text-slate-400" aria-hidden="true" />
              Source definitions, filters, AI preferences, monitored post text, status,
              history, and errors are never treated as global configuration. Individual
              Telegram bot credentials remain in user-scoped Vault secrets.
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="border-b border-slate-100 p-5">
            <div className="flex items-center gap-2">
              <Clock3 className="h-5 w-5 text-sky-600" aria-hidden="true" />
              <h3 className="font-display text-base font-bold text-slate-950">
                Collection Automation
              </h3>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              The scheduler enumerates owners with enabled sources and runs collection in
              each isolated workspace using that member&apos;s filters and post records.
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
                No TGReposter collection jobs were found.
              </div>
            ) : (
              health.automation.jobs.map((job) => (
                <div
                  key={job.name}
                  className="rounded-xl border border-slate-100 bg-slate-50/50 p-4"
                >
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
                      healthyText={
                        job.lastStatus === "succeeded" ? "Succeeded" : "Active"
                      }
                      unhealthyText={job.active ? "Last run failed" : "Disabled"}
                    />
                  </div>
                  <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                    Last run:{" "}
                    <span className="font-medium text-slate-600">
                      {formatLastRun(job.lastRunAt)}
                    </span>
                    {job.lastReturnMessage ? (
                      <span className="ml-2 text-slate-400">
                        · {job.lastReturnMessage}
                      </span>
                    ) : null}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-bold text-emerald-950">
              Migration-managed, secure-by-default runtime
            </h3>
            <p className="mt-1 text-xs leading-5 text-emerald-800">
              Structural changes are versioned through Supabase migrations. All application
              configuration and content are member-owned, and sensitive writes are handled
              by authenticated backend routes rather than direct browser database access.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
