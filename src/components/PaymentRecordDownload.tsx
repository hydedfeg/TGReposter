import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { safeResponseJson } from "../utils/api";

export default function PaymentRecordDownload({ authToken, orderId, orderType }: {
  authToken: string; orderId: string; orderType: "subscription" | "topup";
}) {
  const { t } = useTranslation("billing");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current?.abort(); };
  }, []);
  async function download() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true); setError(false);
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`/api/billing/orders/${orderType}/${encodeURIComponent(orderId)}/payment-record`, {
        headers: { Authorization: `Bearer ${authToken}` }, cache: "no-store", signal: controller.signal,
      });
      const body = await safeResponseJson(response);
      if (!mounted.current) return;
      if (controller.signal.aborted) throw Error("Interrupted");
      const record = body?.record;
      if (!response.ok || record?.documentType !== "payment_record" || record.taxInvoice !== false ||
          record.orderId !== orderId.toLowerCase() || record.orderType !== orderType) throw Error("Unavailable");
      const url = URL.createObjectURL(new Blob([JSON.stringify({ notice: t("paymentRecord.notice"), record }, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url; link.download = `tgreposter-payment-${orderType}-${record.orderId}.json`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (mounted.current) setError(true);
    } finally {
      clearTimeout(timeout); request.current = null;
      if (mounted.current) setPending(false);
    }
  }
  return <div className="min-w-0 space-y-1">
    <button type="button" onClick={download} disabled={pending}
      className="min-h-11 rounded-lg border border-slate-200 px-3 py-2 text-start text-xs font-semibold text-sky-700 active:bg-slate-100 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-sky-600">
      {t(pending ? "paymentRecord.loading" : "paymentRecord.download")}
    </button>
    {error ? <p role="alert" className="max-w-xs text-xs text-amber-800">{t("paymentRecord.error")}</p> : null}
  </div>;
}
