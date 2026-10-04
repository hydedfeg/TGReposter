import { useMemo, useState, type ReactNode } from "react";
import {
  Archive,
  ArrowLeft,
  Check,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileText,
  Filter,
  Inbox,
  Languages,
  ListFilter,
  MoreHorizontal,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { getInitials } from "../utils/text";

type Variant = "command" | "focus" | "triage";

interface PrototypePost {
  id: string;
  channel: string;
  time: string;
  status: "pending" | "approved";
  original: string;
  edited: string;
  destination: string;
  mediaLabel?: string;
}

const normalPosts: PrototypePost[] = [
  {
    id: "observer/1049386",
    channel: "me_observer_tg",
    time: "18:42",
    status: "pending",
    original:
      "Regional connectivity was disrupted again this evening. Local observers report intermittent mobile data and slower access to several messaging platforms.",
    edited:
      "Connectivity disruptions returned this evening, with observers reporting intermittent mobile data and slower access to several messaging platforms.",
    destination: "Resistance News Channel",
    mediaLabel: "Photo",
  },
  {
    id: "newsroom/8821",
    channel: "RegionalNewsroom",
    time: "18:31",
    status: "pending",
    original:
      "Officials published a short statement confirming that an investigation remains active and additional updates are expected.",
    edited:
      "Officials confirmed the investigation remains active and said additional updates are expected.",
    destination: "Daily Brief",
  },
  {
    id: "signals/772",
    channel: "SignalDesk",
    time: "18:19",
    status: "approved",
    original:
      "A monitoring group says service levels improved after 17:30, though some regions continue to report degraded performance.",
    edited:
      "A monitoring group says service improved after 17:30, although degraded performance continues in some regions.",
    destination: "Resistance News Channel",
  },
  {
    id: "fa/203",
    channel: "خبر_فوری",
    time: "18:05",
    status: "pending",
    original:
      "گزارش‌های تازه از ادامه اختلال در برخی مناطق خبر می‌دهند. جزئیات بیشتری هنوز منتشر نشده است.",
    edited:
      "گزارش‌های تازه نشان می‌دهد اختلال در برخی مناطق ادامه دارد و جزئیات بیشتر هنوز منتشر نشده است.",
    destination: "اخبار روز",
  },
];

const stressPosts: PrototypePost[] = [
  {
    id: "stress/1",
    channel: "👩‍💻_extremely_long_telegram_channel_name_with_context_and_region_updates",
    time: "18:42",
    status: "pending",
    original:
      "⚡️ A deliberately long source post used to test wrapping, mixed-direction text, URLs, hashtags, and unpredictable content density. https://example.com/a/very/long/path/that/should/not/break/the/interface #breaking #regional_update",
    edited:
      "A deliberately long rewritten post used to verify that the editor, destination controls, and review actions remain usable under worst-case content density.",
    destination: "A very long destination name that should never force primary actions off screen",
    mediaLabel: "Photo + long caption",
  },
  {
    id: "stress/2",
    channel: "کانال_خبری_بسیار_طولانی_برای_آزمایش_رابط_کاربری",
    time: "18:31",
    status: "pending",
    original:
      "این متن برای آزمایش راست‌به‌چپ، طول زیاد محتوا و ترکیب متن فارسی با Telegram، URL و اعداد ۲۰۲۶ استفاده می‌شود.",
    edited:
      "نسخه ویرایش‌شده برای بررسی خوانایی، تراکم اطلاعات و پایداری رابط در حالت راست‌به‌چپ.",
    destination: "مقصد خبری بسیار طولانی برای آزمایش رابط",
  },
  {
    id: "stress/3",
    channel: "очень_длинное_название_канала_для_проверки_интерфейса",
    time: "18:19",
    status: "approved",
    original:
      "Очень длинный пример текста для проверки интерфейса при локализации, масштабировании и ограниченной ширине экрана.",
    edited:
      "Длинный тестовый текст помогает проверить устойчивость интерфейса при локализации и узких контейнерах.",
    destination: "Новостной канал с очень длинным названием",
  },
  {
    id: "stress/4",
    channel: "mixed_العربية_English_فارسی_Русский_emoji_🚀",
    time: "18:05",
    status: "pending",
    original:
      "Mixed direction content: العربية فارسی English Русский 🚀 with averyveryveryveryverylongunbrokenidentifierthatmustnotdestroylayout.",
    edited:
      "Mixed-direction edited copy used to validate layout resilience.",
    destination: "Destination / مقصد / Канал",
  },
];

const variantLabels: Record<Variant, { name: string; description: string }> = {
  command: {
    name: "Command Desk",
    description: "Dense three-pane review for high-throughput editorial work.",
  },
  focus: {
    name: "Focused Review",
    description: "Editorial-first review with fewer simultaneous decisions.",
  },
  triage: {
    name: "Triage Stream",
    description: "Fast scanning and quick decisions before deep editing.",
  },
};

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600">
      {children}
    </span>
  );
}

function StatusPill({ status }: { status: PrototypePost["status"] }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${
        status === "approved"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-amber-200 bg-amber-50 text-amber-700"
      }`}
    >
      {status === "approved" ? "Approved" : "Pending"}
    </span>
  );
}

function SourceIdentity({
  post,
  compact = false,
  inverse = false,
}: {
  post: PrototypePost;
  compact?: boolean;
  inverse?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className={`flex shrink-0 items-center justify-center rounded-full font-bold ${
          compact ? "h-9 w-9 text-xs" : "h-11 w-11 text-sm"
        } ${inverse ? "bg-white/10 text-white" : "bg-slate-950 text-white"}`}
      >
        {getInitials(post.channel, "TG")}
      </span>
      <div className="min-w-0">
        <p className={`truncate text-sm font-bold ${inverse ? "text-white" : "text-slate-900"}`} dir="auto" title={post.channel}>
          @{post.channel}
        </p>
        <p className={`mt-0.5 text-xs ${inverse ? "text-slate-400" : "text-slate-400"}`}>{post.time}</p>
      </div>
    </div>
  );
}

function PrototypeToolbar({
  variant,
  setVariant,
  rtl,
  setRtl,
  stress,
  setStress,
}: {
  variant: Variant;
  setVariant: (variant: Variant) => void;
  rtl: boolean;
  setRtl: (rtl: boolean) => void;
  stress: boolean;
  setStress: (stress: boolean) => void;
}) {
  return (
    <div className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-xl sm:px-6">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">Prototype · Content Inbox V2</p>
          <h1 className="mt-1 truncate font-display text-xl font-bold text-slate-950">
            {variantLabels[variant].name}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">{variantLabels[variant].description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(["command", "focus", "triage"] as Variant[]).map((item, index) => (
            <button
              key={item}
              type="button"
              onClick={() => setVariant(item)}
              className={`min-h-10 rounded-xl border px-3 text-sm font-bold transition-colors ${
                variant === item
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {index + 1}. {variantLabels[item].name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setStress(!stress)}
            className={`min-h-10 rounded-xl border px-3 text-sm font-bold ${
              stress ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            {stress ? "Worst-case data" : "Normal data"}
          </button>
          <button
            type="button"
            onClick={() => setRtl(!rtl)}
            className={`min-h-10 rounded-xl border px-3 text-sm font-bold ${
              rtl ? "border-violet-200 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            {rtl ? "RTL" : "LTR"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CommandDesk({
  posts,
  selected,
  onSelect,
}: {
  posts: PrototypePost[];
  selected: PrototypePost;
  onSelect: (post: PrototypePost) => void;
}) {
  return (
    <div className="grid min-h-[760px] overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm xl:h-[calc(100dvh-11rem)] xl:min-h-[680px] xl:grid-cols-[320px_minmax(0,0.86fr)_minmax(430px,1.14fr)]">
      <aside className="min-h-0 border-e border-slate-200 bg-slate-50/60">
        <div className="border-b border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-display text-base font-bold text-slate-950">Review queue</p>
              <p className="text-xs text-slate-500">{posts.length} visible · 1,248 total</p>
            </div>
            <button className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600">
              <ListFilter className="h-4 w-4" />
            </button>
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              readOnly
              placeholder="Search posts"
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 ps-9 pe-3 text-sm"
            />
          </div>
        </div>
        <div className="h-full min-h-0 divide-y divide-slate-100 overflow-y-auto">
          {posts.map((post) => (
            <button
              key={post.id}
              type="button"
              onClick={() => onSelect(post)}
              className={`content-visibility-auto w-full p-4 text-start transition-colors ${
                selected.id === post.id ? "bg-sky-50 ring-1 ring-inset ring-sky-200" : "hover:bg-white"
              }`}
            >
              <SourceIdentity post={post} compact />
              <p className="mt-3 line-clamp-3 text-sm leading-5 text-slate-600" dir="auto">
                {post.original}
              </p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <StatusPill status={post.status} />
                {post.mediaLabel ? <span className="text-[11px] font-semibold text-slate-400">{post.mediaLabel}</span> : null}
              </div>
            </button>
          ))}
        </div>
      </aside>

      <section className="min-h-0 border-e border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Original</p>
            <p className="mt-1 text-sm font-semibold text-slate-700">Source context</p>
          </div>
          <button className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold text-sky-600 hover:bg-sky-50">
            Open source <ExternalLink className="h-4 w-4" />
          </button>
        </div>
        <div className="h-full overflow-y-auto p-5">
          <SourceIdentity post={selected} />
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="whitespace-pre-wrap text-[15px] leading-7 text-slate-700" dir="auto">
              {selected.original}
            </p>
          </div>
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-100/70 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Media context</p>
            <div className="mt-3 flex h-44 items-center justify-center rounded-xl bg-slate-900 text-sm font-bold text-slate-300">
              {selected.mediaLabel || "No media attached"}
            </div>
          </div>
        </div>
      </section>

      <section className="flex min-h-0 flex-col bg-slate-50/50">
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-600">Curated version</p>
              <h2 className="mt-1 font-display text-xl font-bold text-slate-950">Edit for publishing</h2>
            </div>
            <div className="flex gap-2">
              <Pill><Sparkles className="me-1 h-3.5 w-3.5" /> AI ready</Pill>
              <Pill>EN</Pill>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50/70 p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
                <WandSparkles className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900">AI quick actions</p>
                <p className="text-xs text-slate-500">Rewrite without leaving the review context.</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {["Rewrite", "Summarize", "Improve", "Hashtags"].map((action) => (
                <button key={action} className="min-h-10 rounded-xl border border-violet-200 bg-white px-3 text-xs font-bold text-violet-700">
                  {action}
                </button>
              ))}
            </div>
          </div>

          <textarea
            readOnly
            value={selected.edited}
            dir="auto"
            rows={10}
            className="mt-5 w-full resize-none rounded-2xl border border-slate-200 bg-white p-4 text-[15px] leading-7 text-slate-800 outline-none"
          />

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Publishing destination</p>
            <p className="mt-2 break-words text-sm font-bold text-slate-900" dir="auto">{selected.destination}</p>
          </div>
        </div>

        <div className="border-t border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600">
              <Archive className="h-4 w-4" /> Archive
            </button>
            <button className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-bold text-emerald-700">
              <Check className="h-4 w-4" /> Approve
            </button>
            <button className="inline-flex min-h-11 flex-[1.35] items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 text-sm font-bold text-white shadow-lg shadow-sky-100">
              <Send className="h-4 w-4" /> Publish now
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function FocusedReview({
  posts,
  selected,
  onSelect,
}: {
  posts: PrototypePost[];
  selected: PrototypePost;
  onSelect: (post: PrototypePost) => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm xl:sticky xl:top-32 xl:h-[calc(100dvh-10rem)]">
        <div className="flex items-center justify-between px-2 py-2">
          <div>
            <p className="font-display text-base font-bold text-slate-950">Queue</p>
            <p className="text-xs text-slate-400">One decision at a time</p>
          </div>
          <Filter className="h-4 w-4 text-slate-400" />
        </div>
        <div className="mt-2 space-y-2 overflow-y-auto">
          {posts.map((post, index) => (
            <button
              type="button"
              key={post.id}
              onClick={() => onSelect(post)}
              className={`w-full rounded-2xl border p-3 text-start ${
                selected.id === post.id
                  ? "border-sky-300 bg-sky-50"
                  : "border-transparent bg-slate-50 hover:border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-400">{String(index + 1).padStart(2, "0")}</span>
                <span className="text-xs text-slate-400">{post.time}</span>
              </div>
              <p className="mt-2 truncate text-sm font-bold text-slate-900" dir="auto">@{post.channel}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500" dir="auto">{post.original}</p>
            </button>
          ))}
        </div>
      </aside>

      <main className="mx-auto w-full max-w-5xl">
        <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-100 px-5 py-5 sm:px-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <SourceIdentity post={selected} inverse />
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={selected.status} />
                <button className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
            </div>
          </header>

          <div className="grid gap-0 lg:grid-cols-2">
            <section className="border-b border-slate-100 p-5 sm:p-7 lg:border-b-0 lg:border-e">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Original</p>
              <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-slate-700" dir="auto">{selected.original}</p>
              <button className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold text-sky-600">
                Open on Telegram <ExternalLink className="h-4 w-4" />
              </button>
            </section>

            <section className="bg-slate-50/60 p-5 sm:p-7">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-600">Publish copy</p>
                <span className="text-xs font-semibold text-slate-400">Edited · autosaved</span>
              </div>
              <textarea
                readOnly
                value={selected.edited}
                dir="auto"
                rows={11}
                className="mt-4 w-full resize-none rounded-2xl border border-slate-200 bg-white p-4 text-[15px] leading-7 text-slate-800"
              />
            </section>
          </div>

          <section className="border-t border-slate-100 px-5 py-5 sm:px-7">
            <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <Sparkles className="h-5 w-5 shrink-0 text-violet-600" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">AI assistant</p>
                    <p className="text-xs text-slate-500">Use AI only when the current draft needs help.</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {["Rewrite", "Shorter", "Translate"].map((action) => (
                    <button key={action} className="min-h-10 rounded-xl bg-white px-3 text-xs font-bold text-violet-700 shadow-xs">
                      {action}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <footer className="border-t border-slate-100 bg-white px-5 py-4 sm:px-7">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Destination</p>
                <p className="mt-1 truncate text-sm font-bold text-slate-800" dir="auto" title={selected.destination}>
                  {selected.destination}
                </p>
              </div>
              <div className="flex gap-2">
                <button className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600">Archive</button>
                <button className="min-h-11 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-bold text-emerald-700">Approve</button>
                <button className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-600 px-5 text-sm font-bold text-white">
                  Publish <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}

function TriageStream({
  posts,
  selected,
  onSelect,
}: {
  posts: PrototypePost[];
  selected: PrototypePost;
  onSelect: (post: PrototypePost) => void;
}) {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="space-y-3">
          {posts.map((post) => (
            <article
              key={post.id}
              className={`rounded-[24px] border bg-white p-4 shadow-xs sm:p-5 ${
                selected.id === post.id ? "border-sky-300 ring-2 ring-sky-100" : "border-slate-200"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <SourceIdentity post={post} compact />
                <StatusPill status={post.status} />
              </div>
              <p className="mt-4 line-clamp-4 whitespace-pre-wrap text-[15px] leading-7 text-slate-700" dir="auto">{post.original}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSelect(post)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white"
                >
                  Review <ChevronRight className="h-4 w-4 rtl-mirror" />
                </button>
                <button className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-bold text-emerald-700">
                  <Check className="h-4 w-4" /> Approve
                </button>
                <button className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600">
                  <Archive className="h-4 w-4" /> Archive
                </button>
                <span className="ms-auto text-xs font-semibold text-slate-400" dir="auto">{post.destination}</span>
              </div>
            </article>
          ))}
        </section>

        <aside className="h-fit rounded-[24px] border border-slate-200 bg-slate-950 p-5 text-white shadow-xl lg:sticky lg:top-32">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-300">Quick inspector</p>
          <div className="mt-4">
            <SourceIdentity post={selected} />
          </div>
          <p className="mt-5 line-clamp-5 text-sm leading-6 text-slate-300" dir="auto">{selected.edited}</p>
          <div className="mt-5 space-y-2">
            <button className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 text-sm font-bold text-white">
              <Send className="h-4 w-4" /> Publish
            </button>
            <button className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-4 text-sm font-bold text-white">
              <FileText className="h-4 w-4" /> Open full editor
            </button>
          </div>
          <div className="mt-5 border-t border-white/10 pt-4">
            <p className="text-xs font-bold text-slate-400">Designed for</p>
            <p className="mt-1 text-sm text-slate-200">Fast triage on tablets and mobile before detailed editorial work.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function ContentInboxPrototype() {
  const [variant, setVariant] = useState<Variant>("command");
  const [rtl, setRtl] = useState(false);
  const [stress, setStress] = useState(false);
  const [selectedId, setSelectedId] = useState("observer/1049386");

  const posts = stress ? stressPosts : normalPosts;
  const selected = useMemo(
    () => posts.find((post) => post.id === selectedId) || posts[0],
    [posts, selectedId],
  );

  const choosePost = (post: PrototypePost) => setSelectedId(post.id);

  return (
    <div dir={rtl ? "rtl" : "ltr"} className="min-h-[100dvh] bg-slate-100/70 text-slate-950">
      <PrototypeToolbar
        variant={variant}
        setVariant={setVariant}
        rtl={rtl}
        setRtl={setRtl}
        stress={stress}
        setStress={(next) => {
          setStress(next);
          setSelectedId(next ? stressPosts[0].id : normalPosts[0].id);
        }}
      />

      <main className="mx-auto max-w-[1720px] px-4 py-5 sm:px-6 sm:py-6 xl:px-8">
        <section className="mb-5 flex flex-col gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/80 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-slate-800">Isolated experiment</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Mock data only. No Telegram, Supabase, AI, approval, or publishing action is connected on this route.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Pill><Inbox className="me-1 h-3.5 w-3.5" /> 1,248 queue</Pill>
            <Pill><Languages className="me-1 h-3.5 w-3.5" /> EN · RU · AR · FA</Pill>
            <Pill><Clock3 className="me-1 h-3.5 w-3.5" /> High frequency</Pill>
          </div>
        </section>

        {variant === "command" ? (
          <CommandDesk posts={posts} selected={selected} onSelect={choosePost} />
        ) : variant === "focus" ? (
          <FocusedReview posts={posts} selected={selected} onSelect={choosePost} />
        ) : (
          <TriageStream posts={posts} selected={selected} onSelect={choosePost} />
        )}
      </main>
    </div>
  );
}
