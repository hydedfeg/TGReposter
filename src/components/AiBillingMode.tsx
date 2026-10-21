import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { safeResponseJson } from "../utils/api";
import type { AiBillingMode, AiCreditAvailability } from "../utils/aiBilling";

export interface AiCreditBalance {
  includedAvailable: string;
  purchasedAvailable: string;
  periodEnd: string | null;
}

/** Never store balances or the selected payment mode in shared browser storage.
 * Re-read owner-scoped eligibility after mount, login change and each debit.
 */
export function useAiBillingMode(authToken?: string | null) {
  const [mode, setMode] = useState<AiBillingMode>("byok");
  const [availability, setAvailability] = useState<AiCreditAvailability>("loading");
  const [balance, setBalance] = useState<AiCreditBalance | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const refresh = useCallback(() => setRefreshIndex(value => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setMode("byok");
    setBalance(null);
    if (!authToken) {
      setAvailability("disabled");
      return () => controller.abort();
    }
    setAvailability("loading");
    void (async () => {
      try {
        const response = await fetch("/api/billing/ai-credits/status", {
          headers: { Authorization: `Bearer ${authToken}` },
          cache: "no-store",
          signal: controller.signal
        });
        const data = await safeResponseJson(response);
        if (controller.signal.aborted || localStorage.getItem("curator_token") !== authToken) return;
        const result = data as {
          enabled?: boolean;
          balance?: AiCreditBalance;
        };
        if (response.ok && result?.enabled === true && result.balance &&
            typeof result.balance.includedAvailable === "string" &&
            typeof result.balance.purchasedAvailable === "string") {
          setBalance(result.balance);
          setAvailability("ready");
        } else if (response.ok && result?.enabled === false) {
          setAvailability("disabled");
        } else {
          setAvailability("unavailable");
        }
      } catch {
        if (!controller.signal.aborted) setAvailability("unavailable");
      }
    })();
    return () => controller.abort();
  }, [authToken, refreshIndex]);

  const selectMode = useCallback((next: AiBillingMode) => {
    setMode(next === "included" && availability !== "ready" ? "byok" : next);
  }, [availability]);

  return {
    mode: availability === "ready" ? mode : "byok",
    selectMode,
    availability,
    balance,
    refresh
  };
}

export function AiBillingModePanel({
  mode,
  selectMode,
  availability,
  balance,
  provider,
  busy = false,
  refresh
}: {
  mode: AiBillingMode;
  selectMode: (mode: AiBillingMode) => void;
  availability: AiCreditAvailability;
  balance: AiCreditBalance | null;
  provider: string;
  busy?: boolean;
  refresh: () => void;
}) {
  const {t, i18n} = useTranslation("ai");
  const includedReady = availability === "ready" && provider === "openrouter";
  const numbers = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 });
  const value = (units: string) => {
    const amount = Number(units);
    return Number.isFinite(amount) ? numbers.format(amount) : "—";
  };
  const period = balance?.periodEnd && Number.isFinite(Date.parse(balance.periodEnd))
    ? new Intl.DateTimeFormat(i18n.language, { dateStyle:"medium" }).format(new Date(balance.periodEnd))
    : null;
  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/30 p-3" aria-label={t("billingMode.title")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold text-slate-800">{t("billingMode.title")}</p>
        <button type="button" onClick={refresh} disabled={busy}
          aria-label={t("billingMode.refresh")}
          className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-slate-600 hover:bg-white disabled:opacity-50">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true"/>{t("billingMode.refresh")}
        </button>
      </div>
      <div role="group" aria-label={t("billingMode.title")} className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" aria-pressed={mode === "byok"} disabled={busy} onClick={() => selectMode("byok")}
          className={`min-h-10 rounded-lg border px-2 text-xs font-bold transition-colors disabled:opacity-60 ${mode === "byok" ? "border-violet-600 bg-violet-600 text-white" : "border-slate-200 bg-white text-slate-700"}`}>
          {t("billingMode.byok")}
        </button>
        <button type="button" aria-pressed={mode === "included"} disabled={!includedReady || busy}
          onClick={() => selectMode("included")}
          className={`min-h-10 rounded-lg border px-2 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${mode === "included" ? "border-violet-600 bg-violet-600 text-white" : "border-slate-200 bg-white text-slate-700"}`}>
          {t("billingMode.included")}
        </button>
      </div>
      {availability === "ready" && balance ? (
        <p className="mt-2 text-xs leading-5 text-slate-600">
          {t("billingMode.balance", {
            included: value(balance.includedAvailable),
            purchased: value(balance.purchasedAvailable)
          })}
          {period ? ` · ${t("billingMode.periodEnd", {date:period})}` : ""}
        </p>
      ) : (
        <p className="mt-2 text-xs leading-5 text-slate-600">
          {t(availability === "loading" ? "billingMode.loading" :
            availability === "unavailable" ? "billingMode.error" : "billingMode.notLaunched")}
        </p>
      )}
      {availability === "ready" && provider !== "openrouter" ? (
        <p className="mt-1 text-xs text-amber-700">{t("billingMode.openRouterOnly")}</p>
      ) : null}
      <p className="mt-1 text-xs text-slate-500">{t(mode === "included" ? "billingMode.usageNotice" : "billingMode.byokNotice")}</p>
    </div>
  );
}
