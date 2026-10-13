import { ArrowRight, Sparkles } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppLocale } from "../i18n";
import { aiTopUps, salesPlans } from "../data/salesPlans";

export default function MarketingSalesPlan({ locale }: { locale: AppLocale }) {
  const { t } = useTranslation("marketing");
  const [period, setPeriod] = useState<"monthly" | "annual">("monthly");
  const integer = new Intl.NumberFormat(locale);
  const money = (n: number) => new Intl.NumberFormat(locale, {
    style: "currency", currency: "EUR",
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2,
  }).format(n);
  const quantity = (n: number | null) => n === null ? t("salesPlan.custom") : integer.format(n);

  return (
    <section id="sales-plan" aria-labelledby="sales-plan-title" className="scroll-mt-20 bg-white px-5 py-24 sm:px-8 lg:py-32">
      <div className="mx-auto max-w-[1240px]">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-[730px]">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#078fc9]">{t("salesPlan.eyebrow")}</p>
            <h2 id="sales-plan-title" className="mt-4 font-display text-4xl font-bold leading-[1.1] tracking-[-0.04em] text-[#071827] sm:text-5xl">{t("salesPlan.title")}</h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">{t("salesPlan.intro")}</p>
          </div>
          <div role="group" aria-label={t("salesPlan.billingLabel")} className="inline-flex w-fit max-w-full items-center gap-1 rounded-2xl border border-slate-200 bg-slate-100 p-1.5">
            {(["monthly", "annual"] as const).map(option => (
              <button key={option} type="button" aria-pressed={period === option} onClick={() => setPeriod(option)}
                className={"min-h-11 rounded-xl px-4 py-2 text-sm font-bold transition-colors duration-150 active:scale-[0.98] " +
                  (period === option ? "bg-[#071827] text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-[#071827]")}>
                {t("salesPlan.periods." + option)}
              </button>
            ))}
          </div>
        </div>
        <p role="note" className="mt-8 rounded-2xl border border-cyan-200 bg-cyan-50 px-5 py-4 text-sm font-medium leading-6 text-[#16536a]">{t("salesPlan.notice")}</p>
        <div className="mt-9 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {salesPlans.map(plan => {
            const featured = plan.id === "professional";
            const custom = plan.monthly === null || plan.annual === null;
            const price = custom ? null : period === "annual" ? plan.annual / 12 : plan.monthly;
            const planName = t("salesPlan.plans." + plan.id + ".name");
            return (
              <article key={plan.id} className={"flex min-w-0 flex-col rounded-[28px] border p-6 sm:p-7 " +
                (featured ? "border-[#071827] bg-[#071827] text-white shadow-[0_22px_64px_rgba(7,24,39,0.21)]" :
                  "border-slate-200 bg-[#f8fbfc] text-[#071827]")}>
                <div className="flex min-h-7 items-center justify-between gap-3">
                  <p className={"text-xs font-bold uppercase tracking-[0.12em] " + (featured ? "text-cyan-300" : "text-[#078fc9]")}>
                    {t("salesPlan.plans." + plan.id + ".audience")}
                  </p>
                  {featured && <span className="shrink-0 rounded-full bg-[#b7f52c] px-3 py-1 text-xs font-extrabold text-[#163000]">{t("salesPlan.popular")}</span>}
                </div>
                <h3 className="mt-3 font-display text-2xl font-bold tracking-[-0.03em]">{planName}</h3>
                <p className={"mt-2 min-h-14 text-sm leading-6 " + (featured ? "text-slate-300" : "text-slate-600")}>
                  {t("salesPlan.plans." + plan.id + ".description")}
                </p>
                <div className="mt-5 min-h-24">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span dir="ltr" className="font-display text-[2.6rem] font-bold leading-tight tracking-[-0.045em] tabular-nums">
                      {price === null ? t("salesPlan.custom") : money(price)}
                    </span>
                    {price !== null && price !== 0 && <span className="text-sm font-semibold opacity-75">{t("salesPlan.perMonth")}</span>}
                  </div>
                  <p className="mt-2 text-sm opacity-75">
                    {custom ? t("salesPlan.enterpriseBilling") : plan.monthly === 0 ? t("salesPlan.freeForever") :
                      period === "annual" ? t("salesPlan.annualCharge", { price: money(plan.annual ?? 0) }) : t("salesPlan.monthlyCharge")}
                  </p>
                </div>
                <div className={"mt-5 border-t pt-6 " + (featured ? "border-white/15" : "border-slate-200")}>
                  <p className="mb-4 text-xs font-bold uppercase tracking-[0.12em] opacity-70">{t("salesPlan.plannedLimits")}</p>
                  <dl className="grid gap-3.5">
                    {([
                      ["users", plan.users], ["sources", plan.sources], ["destinations", plan.destinations],
                      ["campaigns", plan.campaigns], ["ai", plan.ai],
                    ] as const).map(([key, count]) => (
                      <div key={key} className="flex items-start justify-between gap-3 text-sm">
                        <dt className="min-w-0 opacity-75">{t("salesPlan.metrics." + key)}</dt>
                        <dd className="shrink-0 font-bold tabular-nums">{quantity(count)}</dd>
                      </div>
                    ))}
                    <div className="flex items-start justify-between gap-3 text-sm">
                      <dt className="min-w-0 opacity-75">{t("salesPlan.metrics.history")}</dt>
                      <dd className="font-bold">{t("salesPlan.history." + plan.history)}</dd>
                    </div>
                  </dl>
                </div>
                <a href="#request-demo" aria-label={t("salesPlan.discussPlan", { plan: planName })}
                  className={"mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold transition-colors duration-150 active:scale-[0.98] " +
                    (featured ? "bg-[#b7f52c] text-[#183100] hover:bg-[#d2ff72]" : "bg-[#071827] text-white hover:bg-[#0c4058]")}>
                  {t(custom ? "salesPlan.contact" : "salesPlan.request")}
                  <ArrowRight className="rtl-mirror h-4 w-4" aria-hidden="true" />
                </a>
              </article>
            );
          })}
        </div>
        <p className="mt-6 text-sm leading-6 text-slate-600">{t("salesPlan.annualSavings")}</p>
        <div className="mt-16 rounded-[30px] border border-slate-200 bg-[#f3f7f9] p-6 sm:p-9">
          <div className="flex items-center gap-2 text-[#078fc9]"><Sparkles className="h-5 w-5" aria-hidden="true" />
            <p className="text-sm font-bold uppercase tracking-[0.12em]">{t("salesPlan.topUps.eyebrow")}</p>
          </div>
          <h3 className="mt-3 font-display text-2xl font-bold tracking-[-0.035em] text-[#071827] sm:text-3xl">{t("salesPlan.topUps.title")}</h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">{t("salesPlan.topUps.description")}</p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {aiTopUps.map(pack => (
              <div key={pack.id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-sm font-bold text-slate-600">{t("salesPlan.topUps.packs." + pack.id)}</p>
                <p dir="ltr" className="mt-3 font-display text-3xl font-bold tracking-tight text-[#071827] tabular-nums">{money(pack.eur)}</p>
                <p className="mt-2 text-sm font-semibold text-[#078fc9]">{t("salesPlan.topUps.units", { units: integer.format(pack.units) })}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-xs leading-6 text-slate-500">{t("salesPlan.topUps.note")}</p>
        </div>
      </div>
    </section>
  );
}
