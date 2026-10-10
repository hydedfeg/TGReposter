import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Filter,
  Inbox,
  LoaderCircle,
  LockKeyhole,
  Menu,
  Radio,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import LanguageSelector from "./components/LanguageSelector";
import { getLocaleDirection, normalizeAppLocale } from "./i18n";
import { safeResponseJson } from "./utils/api";
import { getMarketingDashboardHref } from "./utils/dashboardLink";

const demoUseCases = ["curation", "campaigns", "both", "other"] as const;
type DemoFormStatus = "idle" | "submitting" | "success" | "error";

const workflow = [
  { number: "01", key: "collect", icon: Radio },
  { number: "02", key: "filter", icon: Filter },
  { number: "03", key: "refine", icon: Sparkles },
  { number: "04", key: "publish", icon: Send },
] as const;

const capabilityKeys = [
  "privateInbox",
  "aiProviders",
  "humanReview",
  "multiDestination",
  "campaigns",
  "roles",
] as const;

const inboxItems = [
  { source: "@futuretech", key: "first" },
  { source: "@digitalbrief", key: "second" },
  { source: "@industrywire", key: "third" },
] as const;

function BrandMark({ inverse = false }: { inverse?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3">
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-[14px] ${
          inverse ? "bg-white text-[#071827]" : "bg-[#08a9ed] text-white"
        }`}
      >
        <Send className="h-5 w-5 -rotate-12" strokeWidth={2.4} aria-hidden="true" />
      </span>
      <span className={`font-display text-xl font-bold tracking-[-0.035em] ${inverse ? "text-white" : "text-[#071827]"}`}>
        TGReposter
      </span>
    </span>
  );
}

export default function MarketingHome() {
  const { t, i18n } = useTranslation(["marketing", "common"]);
  const dashboardUrl = getMarketingDashboardHref(window.location.hostname);
  const [menuOpen, setMenuOpen] = useState(false);
  const [demoFormStatus, setDemoFormStatus] = useState<DemoFormStatus>("idle");
  const locale = normalizeAppLocale(i18n.language);
  const isRtl = getLocaleDirection(locale) === "rtl";

  useEffect(() => {
    document.title = t("marketing:meta.title");
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) description.content = t("marketing:meta.description");
  }, [i18n.language, t]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const handleDemoSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const formData = new FormData(formElement);
    setDemoFormStatus("submitting");

    try {
      const response = await fetch("/api/demo-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: formData.get("fullName"),
          email: formData.get("email"),
          company: formData.get("company"),
          telegramUsername: formData.get("telegramUsername"),
          useCase: formData.get("useCase"),
          message: formData.get("message"),
          website: formData.get("website"),
          locale,
        }),
      });

      await safeResponseJson(response);
      if (!response.ok) throw new Error("demo-request-failed");

      formElement.reset();
      setDemoFormStatus("success");
    } catch {
      setDemoFormStatus("error");
    }
  };

  return (
    <div className="marketing-page min-h-[100svh] overflow-x-hidden bg-[#f3f7f9] text-[#0b2232]">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#061725]/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-[1240px] items-center justify-between px-5 sm:px-8">
          <a href="#top" aria-label={t("marketing:accessibility.home")}>
            <BrandMark inverse />
          </a>

          <nav
            className="hidden items-center gap-8 md:flex"
            aria-label={t("marketing:accessibility.mainNavigation")}
          >
            <a className="text-sm font-semibold text-slate-300 transition hover:text-white" href="#workflow">
              {t("marketing:nav.workflow")}
            </a>
            <a className="text-sm font-semibold text-slate-300 transition hover:text-white" href="#capabilities">
              {t("marketing:nav.capabilities")}
            </a>
            <a className="text-sm font-semibold text-slate-300 transition hover:text-white" href="#security">
              {t("marketing:nav.security")}
            </a>
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <a
              href={dashboardUrl}
              className="px-2 text-sm font-semibold text-slate-300 transition hover:text-white"
            >
              {t("marketing:nav.dashboard")}
            </a>
            <LanguageSelector compact variant="dark" className="min-w-[128px]" />
            <a
              href="#request-demo"
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-[#071827] transition hover:bg-cyan-50"
            >
              {t("marketing:nav.demo")}
              <ArrowRight className="rtl-mirror h-4 w-4" aria-hidden="true" />
            </a>
          </div>

          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-white md:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? t("marketing:accessibility.closeMenu") : t("marketing:accessibility.openMenu")}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {menuOpen ? (
          <div className="border-t border-white/10 bg-[#061725] px-5 py-5 md:hidden">
            <nav
              className="mx-auto grid max-w-[1240px] gap-2"
              aria-label={t("marketing:accessibility.mobileNavigation")}
            >
              <LanguageSelector compact variant="dark" className="mb-2 w-full" />
              {[
                [t("marketing:nav.workflow"), "#workflow"],
                [t("marketing:nav.capabilities"), "#capabilities"],
                [t("marketing:nav.security"), "#security"],
              ].map(([label, href]) => (
                <a
                  key={href}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-xl px-3 py-3 text-base font-semibold text-slate-200"
                >
                  {label}
                </a>
              ))}
              <a
                href={dashboardUrl}
                className="rounded-xl px-3 py-3 text-base font-semibold text-slate-200"
              >
                {t("marketing:nav.dashboard")}
              </a>
              <a
                href="#request-demo"
                onClick={() => setMenuOpen(false)}
                className="mt-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#08a9ed] px-5 font-bold text-white"
              >
                {t("marketing:nav.demo")} <ArrowRight className="rtl-mirror h-4 w-4" />
              </a>
            </nav>
          </div>
        ) : null}
      </header>

      <main id="top">
        <section className="relative isolate min-h-[850px] overflow-hidden bg-[#061725] pt-[calc(76px+env(safe-area-inset-top))] text-white lg:min-h-[780px]">
          <div className="absolute inset-0">
            <img
              src="/brand/tgreposter-flow.webp"
              alt={t("marketing:accessibility.flowImage")}
              className={`${isRtl ? "object-[32%_center]" : "object-[68%_center]"} ms-auto h-full w-full object-cover opacity-45 saturate-125 sm:w-[88%] sm:opacity-70 lg:w-[78%] lg:object-center lg:opacity-100`}
            />
            <div
              className={`absolute inset-0 ${
                isRtl
                  ? "bg-[linear-gradient(270deg,#061725_0%,#061725_31%,rgba(6,23,37,0.88)_45%,rgba(6,23,37,0.18)_72%,rgba(6,23,37,0.04)_100%)]"
                  : "bg-[linear-gradient(90deg,#061725_0%,#061725_31%,rgba(6,23,37,0.88)_45%,rgba(6,23,37,0.18)_72%,rgba(6,23,37,0.04)_100%)]"
              }`}
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_58%,#061725_100%)]" />
          </div>

          <div className="relative mx-auto grid max-w-[1240px] px-5 pb-16 pt-20 sm:px-8 sm:pt-28 lg:grid-cols-[0.88fr_1.12fr] lg:pt-32">
            <div className="max-w-[640px]">
              <div className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-100 backdrop-blur-md">
                <span className="h-2 w-2 rounded-full bg-[#b7f52c] shadow-[0_0_16px_#b7f52c]" />
                {t("marketing:hero.badge")}
              </div>
              <h1 className="font-display text-[3.25rem] font-bold leading-[0.98] tracking-[-0.06em] text-white sm:text-[4.6rem] lg:text-[5.25rem]">
                {t("marketing:hero.title")}
              </h1>
              <p className="mt-7 max-w-xl text-lg leading-8 text-slate-300 sm:text-xl">
                {t("marketing:hero.body")}
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <a
                  href="#request-demo"
                  className="inline-flex min-h-14 items-center justify-center gap-2.5 rounded-full bg-[#08a9ed] px-7 text-base font-bold text-white shadow-[0_18px_50px_rgba(8,169,237,0.26)] transition hover:-translate-y-0.5 hover:bg-[#16b8f5]"
                >
                  {t("marketing:hero.primary")}
                  <ArrowRight className="rtl-mirror h-5 w-5" aria-hidden="true" />
                </a>
                <a
                  href="#workflow"
                  className="inline-flex min-h-14 items-center justify-center rounded-full border border-white/20 bg-white/5 px-7 text-base font-bold text-white backdrop-blur-sm transition hover:bg-white/10"
                >
                  {t("marketing:hero.secondary")}
                </a>
              </div>
              <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-slate-400">
                <span className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-[#b7f52c]" />
                  {t("marketing:hero.humanApproved")}
                </span>
                <span className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-[#b7f52c]" />
                  {t("marketing:hero.isolated")}
                </span>
              </div>
            </div>
          </div>

          <div className="absolute bottom-0 inset-x-0">
            <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
              <div className="flex flex-wrap items-center gap-x-9 gap-y-4 border-t border-white/10 py-6 text-sm font-semibold text-slate-400">
                <span className="me-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                  {t("marketing:hero.stack")}
                </span>
                <span>Telegram</span>
                <span>Google Gemini</span>
                <span>OpenRouter</span>
                <span>Supabase</span>
              </div>
            </div>
          </div>
        </section>

        <section id="workflow" className="scroll-mt-20 px-5 py-24 sm:px-8 lg:py-32">
          <div className="mx-auto max-w-[1240px]">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#078fc9]">
                  {t("marketing:workflow.eyebrow")}
                </p>
                <h2 className="mt-4 max-w-xl font-display text-4xl font-bold leading-[1.04] tracking-[-0.045em] text-[#071827] sm:text-5xl">
                  {t("marketing:workflow.title")}
                </h2>
              </div>
              <p className="max-w-2xl text-lg leading-8 text-slate-600 lg:justify-self-end">
                {t("marketing:workflow.body")}
              </p>
            </div>

            <div className="mt-14 grid overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_22px_80px_rgba(7,24,39,0.08)] md:grid-cols-2 xl:grid-cols-4">
              {workflow.map((step, index) => {
                const Icon = step.icon;
                return (
                  <article
                    key={step.number}
                    className={`relative min-h-[290px] p-7 sm:p-8 ${
                      index ? "border-t border-slate-200 md:border-s md:border-t-0 xl:border-s" : ""
                    } ${index === 2 ? "md:border-s-0 md:border-t xl:border-s xl:border-t-0" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-semibold text-slate-400">{step.number}</span>
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-50 text-[#079bd8]">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                    </div>
                    <h3 className="mt-16 font-display text-2xl font-bold tracking-[-0.025em] text-[#071827]">
                      {t(`marketing:workflow.${step.key}.title`)}
                    </h3>
                    <p className="mt-3 text-base leading-7 text-slate-600">
                      {t(`marketing:workflow.${step.key}.copy`)}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="capabilities" className="scroll-mt-20 bg-white px-5 py-24 sm:px-8 lg:py-32">
          <div className="mx-auto grid max-w-[1240px] gap-14 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
            <div className="relative overflow-hidden rounded-[32px] bg-[#071827] p-6 text-white sm:p-9">
              <div className="absolute end-0 top-0 h-56 w-56 rounded-full bg-cyan-400/15 blur-3xl" />
              <div className="relative rounded-[24px] border border-white/10 bg-[#0b2232]/90 p-5 shadow-2xl sm:p-7">
                <div className="flex items-center justify-between border-b border-white/10 pb-5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#08a9ed]">
                      <Inbox className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-display text-lg font-bold">{t("marketing:inbox.title")}</p>
                      <p className="text-sm text-slate-400">{t("marketing:inbox.status")}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-[#b7f52c]/15 px-3 py-1.5 text-xs font-bold text-[#d7ff74]">
                    {t("marketing:inbox.matched")}
                  </span>
                </div>

                <div className="mt-5 space-y-3">
                  {inboxItems.map((item, index) => (
                    <div
                      key={item.source}
                      className={`rounded-2xl border p-4 ${
                        index === 0 ? "border-cyan-400/40 bg-cyan-400/10" : "border-white/8 bg-white/[0.035]"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span dir="ltr" className="text-sm font-bold text-white">{item.source}</span>
                            <span className="text-xs text-slate-500">{t("marketing:inbox.now")}</span>
                          </div>
                          <p className="mt-1 text-sm text-slate-300">
                            {t(`marketing:inbox.${item.key}.title`)}
                          </p>
                          <span className="mt-3 inline-flex rounded-full border border-white/10 px-2.5 py-1 text-xs font-semibold text-cyan-200">
                            {t(`marketing:inbox.${item.key}.action`)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#078fc9]">
                {t("marketing:capabilities.eyebrow")}
              </p>
              <h2 className="mt-4 font-display text-4xl font-bold leading-[1.04] tracking-[-0.045em] text-[#071827] sm:text-5xl">
                {t("marketing:capabilities.title")}
              </h2>
              <p className="mt-6 text-lg leading-8 text-slate-600">
                {t("marketing:capabilities.body")}
              </p>
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {capabilityKeys.map((key) => (
                  <div key={key} className="flex items-start gap-3 text-[15px] font-semibold leading-6 text-slate-700">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#dff8a0] text-[#315800]">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                    {t(`marketing:capabilities.items.${key}`)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-5 py-24 sm:px-8 lg:py-32">
          <div className="mx-auto max-w-[1240px]">
            <div className="grid gap-5 lg:grid-cols-2">
              <article className="group min-h-[460px] overflow-hidden rounded-[32px] bg-[#0a9bd8] p-8 text-white sm:p-11">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
                  <Inbox className="h-7 w-7" />
                </div>
                <p className="mt-16 text-sm font-bold uppercase tracking-[0.18em] text-cyan-100">
                  {t("marketing:cards.curation.eyebrow")}
                </p>
                <h3 className="mt-4 max-w-md font-display text-4xl font-bold leading-[1.05] tracking-[-0.04em]">
                  {t("marketing:cards.curation.title")}
                </h3>
                <p className="mt-5 max-w-lg text-lg leading-8 text-cyan-50">
                  {t("marketing:cards.curation.body")}
                </p>
              </article>

              <article className="group min-h-[460px] overflow-hidden rounded-[32px] bg-[#071827] p-8 text-white sm:p-11">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#b7f52c] text-[#1e3600]">
                  <Bot className="h-7 w-7" />
                </div>
                <p className="mt-16 text-sm font-bold uppercase tracking-[0.18em] text-slate-400">
                  {t("marketing:cards.campaign.eyebrow")}
                </p>
                <h3 className="mt-4 max-w-md font-display text-4xl font-bold leading-[1.05] tracking-[-0.04em]">
                  {t("marketing:cards.campaign.title")}
                </h3>
                <p className="mt-5 max-w-lg text-lg leading-8 text-slate-300">
                  {t("marketing:cards.campaign.body")}
                </p>
              </article>
            </div>
          </div>
        </section>

        <section id="security" className="scroll-mt-20 bg-[#dff8a0] px-5 py-20 sm:px-8 lg:py-24">
          <div className="mx-auto grid max-w-[1240px] gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div className="flex items-center gap-5">
              <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[24px] bg-[#071827] text-[#b7f52c]">
                <LockKeyhole className="h-9 w-9" />
              </span>
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#4b6c09]">
                  {t("marketing:security.eyebrow")}
                </p>
                <h2 className="mt-2 font-display text-3xl font-bold tracking-[-0.04em] text-[#132700] sm:text-4xl">
                  {t("marketing:security.title")}
                </h2>
              </div>
            </div>
            <p className="text-lg leading-8 text-[#355000]">
              {t("marketing:security.body")}
            </p>
          </div>
        </section>

        <section id="request-demo" className="scroll-mt-20 bg-[#061725] px-5 py-24 text-white sm:px-8 lg:py-32">
          <div className="mx-auto grid max-w-[1240px] gap-12 lg:grid-cols-[0.86fr_1.14fr] lg:items-start lg:gap-16">
            <div className="lg:sticky lg:top-28">
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-cyan-300">
                {t("marketing:cta.eyebrow")}
              </p>
              <h2 className="mt-5 max-w-xl font-display text-4xl font-bold leading-[1.02] tracking-[-0.05em] sm:text-6xl">
                {t("marketing:cta.title")}
              </h2>
              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
                {t("marketing:cta.body")}
              </p>
              <div className="mt-9 grid gap-4">
                {(["tailored", "private", "human"] as const).map((key) => (
                  <div key={key} className="flex items-start gap-3 text-sm font-semibold leading-6 text-slate-300">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#b7f52c]/15 text-[#d7ff74]">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                    {t(`marketing:cta.points.${key}`)}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[32px] bg-white p-6 text-[#071827] shadow-[0_28px_90px_rgba(0,0,0,0.24)] sm:p-9">
              {demoFormStatus === "success" ? (
                <div className="flex min-h-[520px] flex-col items-center justify-center text-center" aria-live="polite">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#dff8a0] text-[#315800]">
                    <CheckCircle2 className="h-8 w-8" />
                  </span>
                  <h3 className="mt-6 font-display text-3xl font-bold tracking-[-0.035em]">
                    {t("marketing:demoForm.successTitle")}
                  </h3>
                  <p className="mt-4 max-w-md text-base leading-7 text-slate-600">
                    {t("marketing:demoForm.successBody")}
                  </p>
                  <button
                    type="button"
                    className="mt-7 text-sm font-bold text-[#078fc9] hover:text-[#071827]"
                    onClick={() => setDemoFormStatus("idle")}
                  >
                    {t("marketing:demoForm.submitAnother")}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleDemoSubmit} className="grid gap-5">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#078fc9]">
                      {t("marketing:demoForm.eyebrow")}
                    </p>
                    <h3 className="mt-2 font-display text-3xl font-bold tracking-[-0.035em]">
                      {t("marketing:demoForm.title")}
                    </h3>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <label className="grid gap-2 text-sm font-bold text-slate-700">
                      {t("marketing:demoForm.fullName")}
                      <input name="fullName" required minLength={2} maxLength={100} autoComplete="name"
                        placeholder={t("marketing:demoForm.fullNamePlaceholder")}
                        className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-medium text-[#071827] outline-none transition placeholder:text-slate-400 focus:border-[#08a9ed] focus:bg-white focus:ring-4 focus:ring-cyan-100" />
                    </label>
                    <label className="grid gap-2 text-sm font-bold text-slate-700">
                      {t("marketing:demoForm.email")}
                      <input name="email" type="email" required maxLength={254} autoComplete="email" dir="ltr"
                        placeholder={t("marketing:demoForm.emailPlaceholder")}
                        className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-medium text-[#071827] outline-none transition placeholder:text-slate-400 focus:border-[#08a9ed] focus:bg-white focus:ring-4 focus:ring-cyan-100" />
                    </label>
                    <label className="grid gap-2 text-sm font-bold text-slate-700">
                      {t("marketing:demoForm.company")}
                      <input name="company" maxLength={120} autoComplete="organization"
                        placeholder={t("marketing:demoForm.companyPlaceholder")}
                        className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-medium text-[#071827] outline-none transition placeholder:text-slate-400 focus:border-[#08a9ed] focus:bg-white focus:ring-4 focus:ring-cyan-100" />
                    </label>
                    <label className="grid gap-2 text-sm font-bold text-slate-700">
                      {t("marketing:demoForm.telegram")}
                      <input name="telegramUsername" maxLength={64} autoComplete="off" dir="ltr"
                        placeholder={t("marketing:demoForm.telegramPlaceholder")}
                        className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-medium text-[#071827] outline-none transition placeholder:text-slate-400 focus:border-[#08a9ed] focus:bg-white focus:ring-4 focus:ring-cyan-100" />
                    </label>
                  </div>

                  <label className="grid gap-2 text-sm font-bold text-slate-700">
                    {t("marketing:demoForm.useCase")}
                    <select name="useCase" defaultValue="both"
                      className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-medium text-[#071827] outline-none transition focus:border-[#08a9ed] focus:bg-white focus:ring-4 focus:ring-cyan-100">
                      {demoUseCases.map((useCase) => (
                        <option key={useCase} value={useCase}>{t(`marketing:demoForm.useCases.${useCase}`)}</option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-2 text-sm font-bold text-slate-700">
                    {t("marketing:demoForm.message")}
                    <textarea name="message" rows={4} maxLength={1200} dir="auto"
                      placeholder={t("marketing:demoForm.messagePlaceholder")}
                      className="resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-medium leading-7 text-[#071827] outline-none transition placeholder:text-slate-400 focus:border-[#08a9ed] focus:bg-white focus:ring-4 focus:ring-cyan-100" />
                  </label>

                  <div className="absolute h-px w-px overflow-hidden opacity-0" aria-hidden="true">
                    <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
                  </div>

                  {demoFormStatus === "error" ? (
                    <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700" role="alert">
                      {t("marketing:demoForm.error")}
                    </p>
                  ) : null}

                  <button type="submit" disabled={demoFormStatus === "submitting"}
                    className="inline-flex min-h-14 items-center justify-center gap-2.5 rounded-full bg-[#08a9ed] px-7 text-base font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#16b8f5] disabled:cursor-not-allowed disabled:opacity-60">
                    {demoFormStatus === "submitting" ? (
                      <>
                        <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
                        {t("marketing:demoForm.submitting")}
                      </>
                    ) : (
                      <>
                        {t("marketing:demoForm.submit")}
                        <ArrowRight className="rtl-mirror h-5 w-5" aria-hidden="true" />
                      </>
                    )}
                  </button>

                  <p className="text-xs leading-5 text-slate-500">
                    {t("marketing:demoForm.privacy")}
                  </p>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-[#061725] px-5 py-8 text-slate-400 sm:px-8">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <BrandMark inverse />
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
            <a href="#workflow" className="hover:text-white">{t("marketing:footer.workflow")}</a>
            <a href="#capabilities" className="hover:text-white">{t("marketing:footer.capabilities")}</a>
            <a href="#security" className="hover:text-white">{t("marketing:footer.security")}</a>
            <a href="#request-demo" className="hover:text-white">{t("marketing:footer.demo")}</a>
            <a href={dashboardUrl} className="hover:text-white">{t("marketing:footer.dashboard")}</a>
          </div>
          <p dir="ltr" className="text-sm">© 2026 TGReposter</p>
        </div>
      </footer>
    </div>
  );
}
