import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowUpRight, CalendarDays, CreditCard, LoaderCircle,
  RefreshCw, ShieldCheck, Sparkles, Wallet, AlertCircle
} from "lucide-react";
import { safeResponseJson } from "../utils/api";

type Overview = {
  availability: "active" | "prelaunch";
  plan: {
    id: string; name: string; published: boolean;
    monthlyEurCents: number | null; annualEurCents: number | null;
    limits: {
      users: number | null; sources: number | null;
      destinations: number | null; activeCampaigns: number | null;
      historyDays: number | null;
    };
    monthlyAiUnits: string | null;
    features: string[];
  };
  subscription: {
    status: string; interval: string; periodStart: string | null;
    periodEnd: string | null; cancelAtPeriodEnd: boolean;
  } | null;
  usage: {
    users: null; sources: number; destinations: number; activeCampaigns: number;
  };
  ai: {
    includedAvailable: string; purchasedAvailable: string;
    includedGranted: string; periodEnd: string | null;
  };
  orders: Array<{
    id: string; type: "subscription" | "topup";
    description: string; status: string; paymentStatus: string;
    listedEurCents: number; createdAt: string;
  }>;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; overview: Overview }
  | { kind: "not-ready" }
  | { kind: "error" };

function finiteNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function limitPercent(used: number, allowed: number | null): number {
  if (allowed === null || allowed <= 0) return 0;
  return Math.min(100, Math.round((used / allowed) * 100));
}

export default function BillingOverview({
  authToken
}: {
  authToken: string | null;
}) {
  const { t, i18n } = useTranslation("billing");
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [refresh, setRefresh] = useState(0);
  const reload = useCallback(() => setRefresh(value => value + 1), []);

  useEffect(() => {
    if (!authToken) {
      setState({ kind: "error" });
      return;
    }
    const controller = new AbortController();
    setState({ kind: "loading" });
    void (async () => {
      try {
        const response = await fetch("/api/billing/overview", {
          method: "GET",
          headers: { Authorization: `Bearer ${authToken}` },
          cache: "no-store",
          signal: controller.signal
        });
        const body = await safeResponseJson(response);
        if (controller.signal.aborted) return;
        if (response.status === 503 && body?.code === "BILLING_NOT_READY") {
          setState({ kind: "not-ready" });
        } else if (response.ok && body?.overview) {
          setState({ kind: "ready", overview: body.overview as Overview });
        } else {
          setState({ kind: "error" });
        }
      } catch {
        if (!controller.signal.aborted) setState({ kind: "error" });
      }
    })();
    return () => controller.abort();
  }, [authToken, refresh]);

  const numbers = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 });
  const euros = new Intl.NumberFormat(i18n.language, {
    style: "currency", currency: "EUR"
  });
  const formatDate = (value: string | null) =>
    value && Number.isFinite(Date.parse(value))
      ? new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(new Date(value))
      : t("notAvailable");

  const cardClass = "rounded-2xl border border-slate-200 bg-white p-5 shadow-xs";

  return (
    <div className="space-y-5 sm:space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-sky-600">{t("eyebrow")}</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{t("title")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("description")}</p>
        </div>
        <button type="button" onClick={reload} disabled={state.kind === "loading"}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> {t("refresh")}
        </button>
      </header>

      {state.kind === "loading" ? (
        <section className={cardClass} role="status">
          <LoaderCircle className="h-7 w-7 animate-spin text-sky-600" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-slate-700">{t("loading")}</p>
        </section>
      ) : state.kind === "not-ready" || state.kind === "error" ? (
        <section className={cardClass} role="status">
          <AlertCircle className="h-8 w-8 text-amber-500" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-bold text-slate-900">
            {state.kind === "not-ready" ? t("notReadyTitle") : t("errorTitle")}
          </h2>
          <p className="mt-1 max-w-prose text-sm leading-6 text-slate-600">
            {state.kind === "not-ready" ? t("notReadyDescription") : t("errorDescription")}
          </p>
        </section>
      ) : (
        <>
          {state.overview.availability === "prelaunch" ? (
            <section className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900" role="status">
              <strong>{t("previewTitle")}</strong>
              <p className="mt-1">{t("previewDescription")}</p>
            </section>
          ) : null}

          <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <article className={cardClass}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-500">{t("currentPlan")}</p>
                  <h2 className="mt-2 font-display text-3xl font-bold text-slate-950">{state.overview.plan.name}</h2>
                  <p className="mt-2 text-sm text-slate-600">
                    {state.overview.plan.monthlyEurCents === null
                      ? t("customPricing")
                      : euros.format(state.overview.plan.monthlyEurCents / 100) + " / " + t("month")}
                  </p>
                </div>
                <span className="rounded-xl bg-sky-50 p-3 text-sky-700">
                  <CreditCard className="h-6 w-6" aria-hidden="true" />
                </span>
              </div>
              <div className="mt-6 flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">
                  {state.overview.availability === "prelaunch"
                    ? t("planned") : t("status", { value: state.overview.subscription?.status ?? "free" })}
                </span>
                {state.overview.subscription?.cancelAtPeriodEnd ? (
                  <span className="rounded-full bg-amber-100 px-3 py-1.5 text-amber-800">{t("cancelScheduled")}</span>
                ) : null}
              </div>
              <div className="mt-5 flex flex-wrap gap-5 border-t border-slate-100 pt-4 text-sm">
                <div>
                  <p className="text-slate-500">{t("billingPeriod")}</p>
                  <p className="mt-1 font-bold text-slate-900">{state.overview.subscription?.interval || t("noSubscription")}</p>
                </div>
                <div>
                  <p className="text-slate-500">{t("renewalDate")}</p>
                  <p className="mt-1 flex items-center gap-2 font-bold text-slate-900">
                    <CalendarDays className="h-4 w-4" aria-hidden="true" />
                    {formatDate(state.overview.subscription?.periodEnd ?? null)}
                  </p>
                </div>
              </div>
            </article>

            <article className={cardClass}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-500">{t("aiBalance")}</p>
                  <h2 className="mt-2 font-display text-3xl font-bold text-slate-950">
                    {numbers.format(finiteNumber(state.overview.ai.includedAvailable) +
                      finiteNumber(state.overview.ai.purchasedAvailable))}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">{t("aiUnits")}</p>
                </div>
                <span className="rounded-xl bg-violet-50 p-3 text-violet-600">
                  <Sparkles className="h-6 w-6" aria-hidden="true" />
                </span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-500">{t("includedAi")}</p>
                  <p className="mt-1 font-bold text-slate-900">{numbers.format(finiteNumber(state.overview.ai.includedAvailable))}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="flex items-center gap-1 text-xs font-semibold text-slate-500">
                    <Wallet className="h-3.5 w-3.5" aria-hidden="true" /> {t("purchasedAi")}
                  </p>
                  <p className="mt-1 font-bold text-slate-900">{numbers.format(finiteNumber(state.overview.ai.purchasedAvailable))}</p>
                </div>
              </div>
              <p className="mt-4 text-xs text-slate-500">
                {t("aiReset", { date: formatDate(state.overview.ai.periodEnd) })}
              </p>
            </article>
          </section>

          <section className={cardClass}>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-sky-600" aria-hidden="true" />
              <h2 className="font-display text-lg font-bold text-slate-950">{t("resourceUsage")}</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">{t("usageDescription")}</p>
            <div className="mt-5 grid gap-5 md:grid-cols-3">
              {([
                ["sources",t("sources")],
                ["destinations",t("destinations")],
                ["activeCampaigns",t("campaigns")]
              ] as const).map(([key,label]) => {
                const count=state.overview.usage[key];
                const limit=state.overview.plan.limits[key];
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <p className="font-semibold text-slate-700">{label}</p>
                      <span className="font-bold tabular-nums text-slate-900">
                        {numbers.format(count)} / {limit === null ? t("custom") : numbers.format(limit)}
                      </span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar"
                      aria-label={label} aria-valuenow={count} aria-valuemin={0}
                      aria-valuemax={limit ?? Math.max(1,count)}>
                      <div className="h-full rounded-full bg-sky-500" style={{width:`${limitPercent(count,limit)}%`}} />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-5 text-xs text-slate-500">{t("seatNote")}</p>
          </section>

          <section className={cardClass}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-950">{t("orderHistory")}</h2>
                <p className="text-sm text-slate-500">{t("ordersDescription")}</p>
              </div>
              <ArrowUpRight className="h-5 w-5 text-slate-400" aria-hidden="true" />
            </div>
            {state.overview.orders.length === 0 ? (
              <p className="mt-6 rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">{t("noOrders")}</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[540px] text-start text-sm">
                  <thead className="border-b border-slate-100 text-slate-500">
                    <tr>
                      <th scope="col" className="px-3 py-3 text-start font-semibold">{t("product")}</th>
                      <th scope="col" className="px-3 py-3 text-start font-semibold">{t("date")}</th>
                      <th scope="col" className="px-3 py-3 text-start font-semibold">{t("payment")}</th>
                      <th scope="col" className="px-3 py-3 text-start font-semibold">{t("fulfillment")}</th>
                      <th scope="col" className="px-3 py-3 text-end font-semibold">{t("amount")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {state.overview.orders.map(order => (
                      <tr key={order.id}>
                        <td className="px-3 py-4 font-semibold text-slate-900">{order.description}</td>
                        <td className="px-3 py-4 text-slate-600">{formatDate(order.createdAt)}</td>
                        <td className="px-3 py-4 text-slate-600">{order.paymentStatus}</td>
                        <td className="px-3 py-4 text-slate-600">{order.status}</td>
                        <td className="px-3 py-4 text-end font-semibold text-slate-900">{euros.format(order.listedEurCents/100)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="text-xs leading-5 text-slate-500">{t("readOnlyNotice")}</p>
        </>
      )}
    </div>
  );
}
