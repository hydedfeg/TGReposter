import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { normalizeAppLocale } from "../i18n";
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

interface SystemErrorState {
  message?: string;
  messageKey?: string;
}

const tableScopes: Record<string, "personal" | "compatibility"> = {
  source_channels: "personal",
  filters: "personal",
  destination_targets: "personal",
  ai_settings: "personal",
  posts: "personal",
  user_inbox_items: "personal",
  curator_settings: "compatibility",
};

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
  const { t, i18n } = useTranslation("system");
  const locale = normalizeAppLocale(i18n.language);
  const numberFormatter = new Intl.NumberFormat(locale);
  const dateTimeFormatter = new Intl.DateTimeFormat(`${locale}-u-ca-gregory`, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const [status, setStatus] = useState<DatabaseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<SystemErrorState | null>(null);

  const formatSchedule = (schedule: string) => {
    if (schedule === "*/5 * * * *") return t("automation.schedules.everyFiveMinutes");
    if (schedule === "0 * * * *") return t("automation.schedules.everyHour");
    return schedule;
  };

  const formatJobName = (name: string) => {
    if (name === "tgreposter-inbox-import") return t("automation.jobs.import");
    if (name === "tgreposter-inbox-cleanup") return t("automation.jobs.cleanup");
    return name;
  };

  const formatLastRun = (value?: string) => {
    if (!value) return t("automation.noRun");
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return dateTimeFormatter.format(date);
  };

  const ownerCount = (count: number) =>
    t("workspace.owners", {
      count,
      formattedCount: numberFormatter.format(count),
    });

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
        if (body?.error) {
          setError({ message: body.error });
        } else {
          setError({ messageKey: "unavailable.fetchFailed" });
        }
        return;
      }

      setStatus(await safeResponseJson(response));
    } catch (err: unknown) {
      setError(
        err instanceof Error && err.message
          ? { message: err.message }
          : { messageKey: "unavailable.healthFailed" },
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchStatus();
  }, []);

  if (loading && !status) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-10">
        <RefreshCw className="mb-3 h-8 w-8 animate-spin text-sky-500" aria-hidden="true" />
        <p className="text-sm font-medium text-slate-500">{t("loading")}</p>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 rounded-2xl border border-slate-200 bg-white p-10 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-500" aria-hidden="true" />
        <div>
          <h3 className="font-display text-base font-bold text-slate-800">
            {t("unavailable.title")}
          </h3>
          <p className="mt-1 max-w-md text-xs leading-5 text-slate-500" dir="auto">
            {error.messageKey ? t(error.messageKey) : error.message}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchStatus()}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-100 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-200"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t("unavailable.retry")}
        </button>
      </div>
    );
  }

  const health = status!;

  const overviewCards = [
    {
      label: t("overview.backendLabel"),
      title: t("overview.backendTitle"),
      icon: Server,
      healthy:
        health.configured &&
        health.hasDirectDbUrl &&
        health.backendMode === "normalized-postgres",
      healthyText: t("overview.backendActive"),
      unhealthyText: t("overview.backendUnavailable"),
    },
    {
      label: t("overview.architectureLabel"),
      title: t("overview.architectureTitle"),
      icon: Layers3,
      healthy: health.workspace.ready,
      healthyText: t("overview.isolated"),
      unhealthyText: t("overview.cutoverIncomplete"),
    },
    {
      label: t("overview.automationLabel"),
      title: t("overview.automationTitle"),
      icon: Clock3,
      healthy: health.automation.ready,
      healthyText: t("overview.jobsActive"),
      unhealthyText: t("overview.automationIncomplete"),
    },
    {
      label: t("overview.securityLabel"),
      title: t("overview.securityTitle"),
      icon: ShieldCheck,
      healthy: health.security.ready,
      healthyText: t("overview.protected", {
        protected: numberFormatter.format(health.security.protectedCount),
        expected: numberFormatter.format(health.security.expectedCount),
      }),
      unhealthyText: t("overview.protected", {
        protected: numberFormatter.format(health.security.protectedCount),
        expected: numberFormatter.format(health.security.expectedCount),
      }),
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
                {t("header.title")}
              </h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {t("header.description")}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-800">
            <ShieldCheck className="h-5 w-5 text-indigo-600" aria-hidden="true" />
            {t("header.scope")}
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
              <p className="text-sm font-bold">{t("header.notice")}</p>
              <p className="mt-1 text-xs leading-5" dir="auto">
                {health.error || (error?.messageKey ? t(error.messageKey) : error?.message)}
              </p>
            </div>
          </div>
        ) : null}

        {!health.workspace.applicationOwnershipReady ? (
          <div className="mt-5 flex gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 text-violet-900">
            <Layers3 className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" aria-hidden="true" />
            <div>
              <p className="text-sm font-bold">{t("header.cutoverTitle")}</p>
              <p className="mt-1 text-xs leading-5 text-violet-800">
                {t("header.cutoverDescription")}
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-400">
            {t("header.supabaseEndpoint")}{" "}
            <span className="font-medium text-slate-500" dir="ltr">
              {health.supabaseUrl || t("header.notConfigured")}
            </span>
          </p>
          <button
            type="button"
            onClick={() => void fetchStatus()}
            disabled={loading}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            {t("header.refresh")}
          </button>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="border-b border-slate-100 p-5">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-sky-600" aria-hidden="true" />
              <h3 className="font-display text-base font-bold text-slate-950">
                {t("monitoring.title")}
              </h3>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {t("monitoring.description")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-px bg-slate-100">
            <Metric
              label={t("monitoring.sourceChannels")}
              value={numberFormatter.format(health.counts.sourceChannels)}
              helper={ownerCount(health.workspace.sourceOwners)}
            />
            <Metric
              label={t("monitoring.monitoredPosts")}
              value={numberFormatter.format(health.counts.inboxPosts)}
              helper={ownerCount(health.workspace.postOwners)}
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="border-b border-slate-100 p-5">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              <h3 className="font-display text-base font-bold text-slate-950">
                {t("workspace.title")}
              </h3>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {t("workspace.description")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-3">
            <Metric
              label={t("workspace.destinationTargets")}
              value={numberFormatter.format(health.counts.destinationTargets)}
              helper={ownerCount(health.workspace.destinationOwners)}
            />
            <Metric
              label={t("workspace.inboxRows")}
              value={numberFormatter.format(health.counts.userInboxItems)}
              helper={ownerCount(health.workspace.inboxOwners)}
            />
            <Metric
              label={t("workspace.publishedWorkflow")}
              value={numberFormatter.format(health.counts.postedPosts)}
              helper={t("workspace.publishStates")}
            />
            <Metric
              label={t("workspace.supabaseMembers")}
              value={numberFormatter.format(health.workspace.activeSupabaseUsers)}
              helper={t("workspace.durableIdentities")}
            />
            <Metric
              label={t("workspace.legacyMembers")}
              value={numberFormatter.format(health.workspace.legacyUsers)}
              helper={t("workspace.usernameOwned")}
            />
            <Metric
              label={t("workspace.unownedRows")}
              value={numberFormatter.format(health.workspace.unownedApplicationRows)}
              helper={t("workspace.shouldRemainZero")}
            />
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="border-b border-slate-100 p-5">
          <div className="flex items-center gap-2">
            <Table2 className="h-5 w-5 text-indigo-600" aria-hidden="true" />
            <h3 className="font-display text-base font-bold text-slate-950">
              {t("runtime.title")}
            </h3>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {t("runtime.description")}
          </p>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {health.runtime.tables.map((table) => {
            const scope = tableScopes[table.name] || "personal";
            return (
              <div
                key={table.name}
                className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-bold text-slate-700">
                      {t(`runtime.tables.${table.name}`, { defaultValue: table.name })}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        scope === "personal"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {t(`runtime.scopes.${scope}`)}
                    </span>
                  </div>
                  <p className="mt-1 truncate font-mono text-[10px] text-slate-400" dir="ltr">
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
                {t("isolation.title")}
              </h3>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {t("isolation.description")}
            </p>
          </div>

          <div className="space-y-3 p-5">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 p-4">
              <div>
                <p className="text-sm font-bold text-slate-800">
                  {t("isolation.ownershipTitle")}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {t("isolation.ownershipDescription")}
                </p>
              </div>
              <HealthBadge
                healthy={health.workspace.applicationOwnershipReady}
                healthyText={t("isolation.ready")}
                unhealthyText={t("isolation.missing")}
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 p-4">
              <div>
                <p className="text-sm font-bold text-slate-800">
                  {t("isolation.inboxTitle")}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {t("isolation.inboxDescription")}
                </p>
              </div>
              <HealthBadge
                healthy={health.workspace.inboxIsolationReady}
                healthyText={t("isolation.ready")}
                unhealthyText={t("isolation.cutoverPending")}
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 p-4">
              <div>
                <p className="text-sm font-bold text-slate-800">
                  {t("isolation.orphanTitle")}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {t("isolation.orphanDescription")}
                </p>
              </div>
              <HealthBadge
                healthy={health.workspace.unownedApplicationRows === 0}
                healthyText={t("isolation.noOrphans")}
                unhealthyText={t("isolation.unowned", {
                  count: numberFormatter.format(health.workspace.unownedApplicationRows),
                })}
              />
            </div>

            <div className="rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">
              <Inbox className="me-1 inline h-4 w-4 text-slate-400" aria-hidden="true" />
              {t("isolation.note")}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="border-b border-slate-100 p-5">
            <div className="flex items-center gap-2">
              <Clock3 className="h-5 w-5 text-sky-600" aria-hidden="true" />
              <h3 className="font-display text-base font-bold text-slate-950">
                {t("automation.title")}
              </h3>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {t("automation.description")}
            </p>
          </div>

          <div className="space-y-3 p-5">
            <div className="flex flex-wrap gap-2">
              <HealthBadge
                healthy={health.automation.pgCronInstalled}
                healthyText={t("automation.cronInstalled")}
                unhealthyText={t("automation.cronMissing")}
              />
              <HealthBadge
                healthy={health.automation.pgNetInstalled}
                healthyText={t("automation.netInstalled")}
                unhealthyText={t("automation.netMissing")}
              />
            </div>

            {health.automation.jobs.length === 0 ? (
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-xs text-amber-800">
                {t("automation.empty")}
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
                      <p className="mt-1 font-mono text-[10px] text-slate-400" dir="ltr">
                        {job.name} · {job.schedule}
                      </p>
                    </div>
                    <HealthBadge
                      healthy={job.active && job.lastStatus !== "failed"}
                      healthyText={
                        job.lastStatus === "succeeded"
                          ? t("automation.succeeded")
                          : t("automation.active")
                      }
                      unhealthyText={
                        job.active
                          ? t("automation.lastRunFailed")
                          : t("automation.disabled")
                      }
                    />
                  </div>
                  <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                    {t("automation.lastRun", { time: formatLastRun(job.lastRunAt) })}
                    {job.lastReturnMessage ? (
                      <span className="ms-2 text-slate-400" dir="auto">
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
              {t("security.title")}
            </h3>
            <p className="mt-1 text-xs leading-5 text-emerald-800">
              {t("security.description")}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
