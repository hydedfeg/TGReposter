import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { safeResponseJson } from "../utils/api";

export default function SubscriptionManagement({ authToken, cancelAtPeriodEnd, periodEnd, onChanged }: {
  authToken: string;
  cancelAtPeriodEnd: boolean;
  periodEnd: string;
  onChanged: () => void;
}) {
  const { t, i18n } = useTranslation("billing");
  const [enabled, setEnabled] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/billing/subscription/management-status", {
          headers: { Authorization: `Bearer ${authToken}` }, cache: "no-store", signal: controller.signal,
        });
        const body = await safeResponseJson(response);
        if (!controller.signal.aborted) setEnabled(response.ok && body?.enabled === true);
      } catch { /* Availability fails closed; billing overview remains readable. */ }
    })();
    return () => {
      mounted.current = false;
      controller.abort();
      request.current?.abort();
    };
  }, [authToken]);

  async function submit() {
    if (busy.current || !enabled || !confirming) return;
    busy.current = true;
    setPending(true);
    setError(null);
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch("/api/billing/subscription/cancellation", {
        method: "POST", cache: "no-store", signal: controller.signal,
        headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ cancelAtPeriodEnd: !cancelAtPeriodEnd }),
      });
      const body = await safeResponseJson(response);
      if (!mounted.current) return;
      if (response.ok && body?.cancellation?.cancelAtPeriodEnd === !cancelAtPeriodEnd) {
        setConfirming(false);
        onChanged();
      } else {
        const codes: Record<string, string> = {
          PAYMENT_REVIEW_REQUIRED: "paymentReview",
          NO_ACTIVE_SUBSCRIPTION: "subscriptionChanged",
          PAID_PERIOD_ENDED: "subscriptionChanged",
          SUBSCRIPTION_CHANGED: "subscriptionChanged",
          BILLING_MANAGEMENT_DISABLED: "unavailable",
          MANAGEMENT_DISABLED: "unavailable",
          BILLING_AUTH_REQUIRED: "signIn",
        };
        setError(codes[String(body?.code)] ?? "failed");
      }
    } catch {
      if (mounted.current) setError("uncertain");
    } finally {
      clearTimeout(timeout);
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }

  if (!enabled) return null;
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(new Date(periodEnd));
  const button = "min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 active:bg-slate-100 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600";
  return <section className="mt-5 min-w-0 space-y-3 border-t border-slate-100 pt-4" aria-label={t("management.title")}>
    <p className="text-sm leading-6 text-slate-600">{t("management.policy", { date })}</p>
    {confirming ? <fieldset disabled={pending} className="min-w-0 space-y-3">
      <legend className="text-sm font-semibold text-slate-900">{t(cancelAtPeriodEnd ? "management.restoreConfirm" : "management.cancelConfirm", { date })}</legend>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} onClick={submit}>{t(pending ? "management.saving" : "management.confirm")}</button>
        <button type="button" className={button} onClick={() => { setConfirming(false); setError(null); }}>{t("management.back")}</button>
      </div>
    </fieldset> : <button type="button" className={button} onClick={() => setConfirming(true)}>
      {t(cancelAtPeriodEnd ? "management.restore" : "management.cancel")}
    </button>}
    {pending ? <p role="status" className="text-sm text-slate-600">{t("management.saving")}</p> : null}
    {error ? <div role="alert" className="space-y-2 text-sm text-amber-800">
      <p>{t(`management.${error}`)}</p>
      <button type="button" className={button} onClick={onChanged}>{t("refresh")}</button>
    </div> : null}
  </section>;
}
