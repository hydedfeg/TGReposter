import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  FileText,
  History,
  Megaphone,
  MoreHorizontal,
  Plus,
  Rocket,
  Search,
  Send,
  ShieldCheck,
  Target,
} from "lucide-react";
import { getInitials } from "../utils/text";

type Variant = "control" | "builder" | "operations";

interface MockCampaign {
  id: string;
  name: string;
  status: "draft" | "ready" | "running" | "completed" | "partial";
  description: string;
  posts: number;
  targets: number;
  succeeded: number;
  failed: number;
}

interface MockPost {
  id: string;
  channel: string;
  source: string;
  promotion: string;
  mode: "original" | "teaser" | "ai" | "custom";
}

interface MockTarget {
  id: string;
  name: string;
  chatId: string;
  type: "channel" | "group" | "supergroup";
  ready: boolean;
}

const normalCampaigns: MockCampaign[] = [
  {
    id: "autumn-brief",
    name: "Autumn regional briefing",
    status: "ready",
    description: "Curated cross-channel briefing for partner Telegram destinations.",
    posts: 4,
    targets: 6,
    succeeded: 0,
    failed: 0,
  },
  {
    id: "signal-watch",
    name: "Signal Watch",
    status: "running",
    description: "Fast distribution of network and regional monitoring updates.",
    posts: 3,
    targets: 5,
    succeeded: 11,
    failed: 2,
  },
  {
    id: "weekly-recap",
    name: "Weekly recap",
    status: "completed",
    description: "Seven-day recap with concise editorial framing.",
    posts: 5,
    targets: 4,
    succeeded: 20,
    failed: 0,
  },
];

const stressCampaigns: MockCampaign[] = [
  {
    id: "stress-1",
    name: "🚀 Extremely long campaign name mixing العربية فارسی Русский English and identifiers 2026-Q4",
    status: "ready",
    description:
      "A deliberately long multilingual campaign description used to stress wrapping, hierarchy, RTL directionality, and action placement across narrow containers.",
    posts: 128,
    targets: 47,
    succeeded: 0,
    failed: 0,
  },
  {
    id: "stress-2",
    name: "کمپین_بسیار_طولانی_برای_بررسی_پایداری_رابط_کاربری",
    status: "partial",
    description: "آزمایش رابط با متن راست‌به‌چپ، تعداد زیاد مقصد و خطاهای تحویل.",
    posts: 34,
    targets: 18,
    succeeded: 503,
    failed: 19,
  },
  {
    id: "stress-3",
    name: "Очень длинная кампания для проверки интерфейса и масштабирования",
    status: "running",
    description: "Проверка плотности информации и управления доставкой.",
    posts: 72,
    targets: 31,
    succeeded: 1104,
    failed: 7,
  },
];

const normalPosts: MockPost[] = [
  {
    id: "observer/1049386",
    channel: "me_observer_tg",
    source:
      "Regional connectivity was disrupted again this evening. Local observers report intermittent mobile data.",
    promotion:
      "Connectivity disruptions returned this evening, with observers reporting intermittent mobile data.",
    mode: "teaser",
  },
  {
    id: "newsroom/8821",
    channel: "RegionalNewsroom",
    source:
      "Officials published a short statement confirming the investigation remains active.",
    promotion:
      "Officials confirmed the investigation remains active and said more updates are expected.",
    mode: "ai",
  },
  {
    id: "fa/203",
    channel: "خبر_فوری",
    source:
      "گزارش‌های تازه از ادامه اختلال در برخی مناطق خبر می‌دهند.",
    promotion:
      "گزارش‌های تازه نشان می‌دهد اختلال در برخی مناطق ادامه دارد.",
    mode: "custom",
  },
];

const stressPosts: MockPost[] = [
  {
    id: "stress/post/averyveryveryveryveryverylongidentifier",
    channel: "👩‍💻_extremely_long_channel_name_with_region_and_topic_context",
    source:
      "A deliberately long source post with mixed direction content العربية فارسی English Русский, emoji 🚀, hashtags, and a URL https://example.com/a/very/long/path/that/must/not/break/layout.",
    promotion:
      "A deliberately long promotional version that verifies copy comparison remains readable under high content density and multilingual text.",
    mode: "ai",
  },
  {
    id: "stress/fa/2",
    channel: "کانال_خبری_بسیار_طولانی_برای_بررسی_رابط",
    source:
      "این متن برای آزمایش راست‌به‌چپ، طول زیاد محتوا و ترکیب فارسی با Telegram و اعداد ۲۰۲۶ استفاده می‌شود.",
    promotion:
      "نسخه تبلیغاتی طولانی برای بررسی پایداری رابط در حالت راست‌به‌چپ.",
    mode: "custom",
  },
  {
    id: "stress/ru/3",
    channel: "очень_длинное_название_канала_для_проверки",
    source:
      "Очень длинный пример текста для проверки интерфейса при локализации и ограниченной ширине.",
    promotion:
      "Промо-текст для проверки плотности, переноса строк и действий.",
    mode: "teaser",
  },
];

const normalTargets: MockTarget[] = [
  { id: "t1", name: "Resistance News Channel", chatId: "@resistance_news", type: "channel", ready: true },
  { id: "t2", name: "Regional Discussion", chatId: "-10022334455", type: "supergroup", ready: true },
  { id: "t3", name: "Daily Brief", chatId: "@dailybrief", type: "channel", ready: true },
  { id: "t4", name: "Partner Group", chatId: "-10099887766", type: "group", ready: false },
];

const stressTargets: MockTarget[] = [
  {
    id: "s1",
    name: "A very long destination name that should never push launch actions off screen",
    chatId: "@extremely_long_destination_handle_for_testing",
    type: "channel",
    ready: true,
  },
  {
    id: "s2",
    name: "مقصد خبری بسیار طولانی برای بررسی رابط کاربری",
    chatId: "-100123456789012345",
    type: "supergroup",
    ready: true,
  },
  {
    id: "s3",
    name: "Очень длинное имя группы для проверки интерфейса",
    chatId: "-100998877665544332",
    type: "group",
    ready: false,
  },
];

const statusStyles: Record<MockCampaign["status"], string> = {
  draft: "border-slate-200 bg-slate-100 text-slate-700",
  ready: "border-sky-200 bg-sky-50 text-sky-700",
  running: "border-amber-200 bg-amber-50 text-amber-700",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  partial: "border-orange-200 bg-orange-50 text-orange-700",
};

const labels: Record<Variant, { name: string; description: string }> = {
  control: {
    name: "Campaign Control Room",
    description: "Keep campaign, content, targets, and launch readiness in one operational frame.",
  },
  builder: {
    name: "Guided Builder",
    description: "Reduce mistakes with a clear build → target → launch sequence.",
  },
  operations: {
    name: "Delivery Operations",
    description: "Optimize for monitoring, failures, retries, and completed campaign health.",
  },
};

function Status({ status }: { status: MockCampaign["status"] }) {
  return (
    <span className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusStyles[status]}`}>
      {status}
    </span>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600">
      {children}
    </span>
  );
}

function CampaignRail({
  campaigns,
  selected,
  onSelect,
}: {
  campaigns: MockCampaign[];
  selected: MockCampaign;
  onSelect: (campaign: MockCampaign) => void;
}) {
  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
      <div className="border-b border-slate-100 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-display text-base font-bold text-slate-950">Campaigns</p>
            <p className="text-xs text-slate-500">{campaigns.length} visible · 128 total</p>
          </div>
          <button className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input readOnly placeholder="Search campaigns" className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 ps-9 pe-3 text-sm" />
        </div>
      </div>
      <div className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
        {campaigns.map((campaign) => (
          <button
            key={campaign.id}
            type="button"
            onClick={() => onSelect(campaign)}
            className={`w-full p-4 text-start ${selected.id === campaign.id ? "bg-sky-50 ring-1 ring-inset ring-sky-200" : "hover:bg-slate-50"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 flex-1 break-words text-sm font-bold text-slate-900" dir="auto">{campaign.name}</p>
              <Status status={campaign.status} />
            </div>
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500" dir="auto">{campaign.description}</p>
            <div className="mt-3 flex gap-3 text-[11px] font-semibold text-slate-400">
              <span>{campaign.posts} posts</span>
              <span>{campaign.targets} targets</span>
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}

function PostList({
  posts,
  selectedId,
  onSelect,
}: {
  posts: MockPost[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {posts.map((post, index) => (
        <button
          key={post.id}
          type="button"
          onClick={() => onSelect(post.id)}
          className={`w-full rounded-2xl border p-3 text-start ${
            post.id === selectedId ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-bold text-white">
              {getInitials(post.channel)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400">{String(index + 1).padStart(2, "0")}</span>
                <p className="truncate text-sm font-bold text-slate-900" dir="auto">@{post.channel}</p>
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500" dir="auto">{post.promotion}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{post.mode}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function TargetList({
  targets,
  selectedIds,
  toggle,
}: {
  targets: MockTarget[];
  selectedIds: string[];
  toggle: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {targets.map((target) => {
        const selected = selectedIds.includes(target.id);
        return (
          <button
            type="button"
            key={target.id}
            disabled={!target.ready}
            onClick={() => toggle(target.id)}
            className={`w-full rounded-xl border p-3 text-start ${
              selected
                ? "border-sky-300 bg-sky-50 ring-2 ring-sky-100"
                : target.ready
                  ? "border-slate-200 bg-white hover:border-slate-300"
                  : "cursor-not-allowed border-slate-100 bg-slate-50 opacity-60"
            }`}
          >
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                selected ? "border-sky-500 bg-sky-500 text-white" : "border-slate-300 bg-white"
              }`}>
                {selected ? <Check className="h-3 w-3" /> : null}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 break-words text-sm font-bold text-slate-800" dir="auto">{target.name}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${
                    target.ready ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"
                  }`}>
                    {target.ready ? "verified" : "blocked"}
                  </span>
                </div>
                <p className="mt-1 truncate font-mono text-[10px] text-slate-400" dir="ltr">{target.chatId} · {target.type}</p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ControlRoom({
  campaigns,
  posts,
  targets,
  campaign,
  setCampaign,
}: {
  campaigns: MockCampaign[];
  posts: MockPost[];
  targets: MockTarget[];
  campaign: MockCampaign;
  setCampaign: (campaign: MockCampaign) => void;
}) {
  const [selectedPostId, setSelectedPostId] = useState(posts[0].id);
  const [selectedTargets, setSelectedTargets] = useState<string[]>(targets.filter((target) => target.ready).slice(0, 2).map((target) => target.id));
  const selectedPost = posts.find((post) => post.id === selectedPostId) || posts[0];
  const toggle = (id: string) => setSelectedTargets((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  return (
    <div className="grid gap-4 xl:h-[calc(100dvh-11.5rem)] xl:min-h-[700px] xl:grid-cols-[300px_minmax(0,1fr)_360px]">
      <CampaignRail campaigns={campaigns} selected={campaign} onSelect={setCampaign} />

      <main className="min-h-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <header className="border-b border-slate-100 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="break-words font-display text-xl font-bold text-slate-950" dir="auto">{campaign.name}</h2>
                <Status status={campaign.status} />
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500" dir="auto">{campaign.description}</p>
            </div>
            <button className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="grid min-h-0 xl:h-[calc(100%-118px)] xl:grid-cols-[280px_minmax(0,1fr)]">
          <section className="min-h-0 border-e border-slate-100 bg-slate-50/60 p-3 xl:overflow-y-auto">
            <div className="mb-3 flex items-center justify-between px-1">
              <div>
                <p className="text-sm font-bold text-slate-900">Campaign content</p>
                <p className="text-xs text-slate-400">{posts.length} posts</p>
              </div>
              <button className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-white"><Plus className="h-4 w-4" /></button>
            </div>
            <PostList posts={posts} selectedId={selectedPostId} onSelect={setSelectedPostId} />
          </section>

          <section className="min-h-0 p-5 xl:overflow-y-auto">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-600">Promotion copy</p>
                <p className="mt-1 text-sm font-semibold text-slate-500" dir="auto">@{selectedPost.channel}</p>
              </div>
              <Pill>{selectedPost.mode}</Pill>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Source</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600" dir="auto">{selectedPost.source}</p>
              </div>
              <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-500">Will publish</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-800" dir="auto">{selectedPost.promotion}</p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
                  <FileText className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900">Copy controls stay contextual</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Content mode, CTA, source link, and AI editing remain attached to the active campaign post.</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="border-b border-slate-100 p-4">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-emerald-600" />
            <p className="text-sm font-bold text-slate-900">Launch readiness</p>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-lg font-bold text-slate-900">{posts.length}</p><p className="text-[10px] text-slate-400">posts</p></div>
            <div className="rounded-xl bg-sky-50 p-3"><p className="text-lg font-bold text-sky-700">{selectedTargets.length}</p><p className="text-[10px] text-sky-500">targets</p></div>
            <div className="rounded-xl bg-emerald-50 p-3"><p className="text-lg font-bold text-emerald-700">{posts.length * selectedTargets.length}</p><p className="text-[10px] text-emerald-500">deliveries</p></div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <TargetList targets={targets} selectedIds={selectedTargets} toggle={toggle} />
        </div>
        <div className="border-t border-slate-200 bg-white p-4 shadow-[0_-8px_24px_rgba(15,23,42,0.04)]">
          <div className="mb-3 flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            {targets.filter((target) => target.ready).length} verified destinations
          </div>
          <button
            disabled={selectedTargets.length === 0}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white disabled:bg-slate-300"
          >
            <Rocket className="h-4 w-4" /> Review & launch
          </button>
        </div>
      </aside>
    </div>
  );
}

function GuidedBuilder({
  posts,
  targets,
  campaign,
}: {
  posts: MockPost[];
  targets: MockTarget[];
  campaign: MockCampaign;
}) {
  const [step, setStep] = useState(1);
  const steps = [
    { n: 1, label: "Content", icon: FileText },
    { n: 2, label: "Targets", icon: Target },
    { n: 3, label: "Launch", icon: Rocket },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <section className="rounded-[28px] border border-slate-200 bg-white shadow-xs">
        <header className="border-b border-slate-100 p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="break-words font-display text-2xl font-bold text-slate-950" dir="auto">{campaign.name}</h2>
                <Status status={campaign.status} />
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500" dir="auto">{campaign.description}</p>
            </div>
            <Pill>Guided launch</Pill>
          </div>

          <div className="mt-6 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2">
            {steps.flatMap((item, index) => {
              const Icon = item.icon;
              const active = step === item.n;
              const done = step > item.n;
              const node = (
                <button
                  key={`step-${item.n}`}
                  type="button"
                  onClick={() => setStep(item.n)}
                  className="text-center"
                >
                  <span className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full ${
                    active ? "bg-slate-950 text-white" : done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                  }`}>
                    {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </span>
                  <p className={`mt-2 text-xs font-bold ${active ? "text-slate-950" : "text-slate-500"}`}>{item.label}</p>
                </button>
              );
              return index < steps.length - 1
                ? [node, <div key={`line-${item.n}`} className="h-px bg-slate-200" />]
                : [node];
            })}
          </div>
        </header>

        <div className="p-5 sm:p-6">
          {step === 1 ? (
            <div>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-bold text-slate-950">Build campaign content</h3>
                  <p className="mt-1 text-sm text-slate-500">Attach, rewrite, and review every post before choosing destinations.</p>
                </div>
                <button className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white"><Plus className="h-4 w-4" /> Add post</button>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {posts.map((post, index) => (
                  <article key={post.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-bold text-white">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-900" dir="auto">@{post.channel}</p>
                        <p className="mt-2 line-clamp-4 text-sm leading-6 text-slate-600" dir="auto">{post.promotion}</p>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <Pill>{post.mode}</Pill>
                          <button className="text-xs font-bold text-sky-600">Edit copy</button>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div>
              <h3 className="font-display text-lg font-bold text-slate-950">Choose verified destinations</h3>
              <p className="mt-1 text-sm text-slate-500">Blocked targets stay visible but cannot be selected.</p>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {targets.map((target) => (
                  <div key={target.id} className={`rounded-2xl border p-4 ${target.ready ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 opacity-65"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-bold text-slate-900" dir="auto">{target.name}</p>
                        <p className="mt-1 truncate font-mono text-xs text-slate-400" dir="ltr">{target.chatId}</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${target.ready ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                        {target.ready ? "Verified" : "Blocked"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
              <div className="rounded-2xl border border-slate-200 p-5">
                <h3 className="font-display text-lg font-bold text-slate-950">Final campaign check</h3>
                <div className="mt-5 space-y-3">
                  {[
                    ["Campaign content", `${posts.length} posts ready`, true],
                    ["Destinations", `${targets.filter((target) => target.ready).length} verified`, true],
                    ["Estimated deliveries", String(posts.length * targets.filter((target) => target.ready).length), true],
                  ].map(([label, value, ok]) => (
                    <div key={String(label)} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
                      <div className="flex items-center gap-2">
                        {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                        <span className="text-sm font-semibold text-slate-700">{label}</span>
                      </div>
                      <span className="text-sm font-bold text-slate-950">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl bg-slate-950 p-5 text-white">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-300">Launch gate</p>
                <p className="mt-3 text-2xl font-bold">{posts.length * targets.filter((target) => target.ready).length}</p>
                <p className="text-sm text-slate-400">deliveries will be attempted</p>
                <button className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-white">
                  <Send className="h-4 w-4" /> Arm launch
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 sm:px-6">
          <button type="button" disabled={step === 1} onClick={() => setStep((current) => Math.max(1, current - 1))} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 disabled:opacity-40">
            Back
          </button>
          <button type="button" disabled={step === 3} onClick={() => setStep((current) => Math.min(3, current + 1))} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white disabled:opacity-40">
            Continue <ChevronRight className="h-4 w-4 rtl-mirror" />
          </button>
        </footer>
      </section>
    </div>
  );
}

function DeliveryOperations({
  campaigns,
  campaign,
  setCampaign,
  targets,
}: {
  campaigns: MockCampaign[];
  campaign: MockCampaign;
  setCampaign: (campaign: MockCampaign) => void;
  targets: MockTarget[];
}) {
  const deliveries = useMemo(
    () =>
      targets.flatMap((target, index) => [
        {
          id: `${target.id}-1`,
          target,
          status: !target.ready ? "failed" : index % 3 === 0 ? "warning" : "success",
          attempts: !target.ready ? 3 : 1,
        },
        {
          id: `${target.id}-2`,
          target,
          status: target.ready ? "success" : "pending",
          attempts: target.ready ? 1 : 0,
        },
      ]),
    [targets],
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <CampaignRail campaigns={campaigns} selected={campaign} onSelect={setCampaign} />

      <main className="min-w-0 space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="break-words font-display text-xl font-bold text-slate-950" dir="auto">{campaign.name}</h2>
                <Status status={campaign.status} />
              </div>
              <p className="mt-1 text-sm text-slate-500">Delivery observability and recovery.</p>
            </div>
            <button className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600">
              <History className="h-4 w-4" /> Attempts
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Deliveries", deliveries.length, BarChart3, "bg-slate-50 text-slate-700"],
              ["Succeeded", deliveries.filter((item) => item.status === "success").length, CheckCircle2, "bg-emerald-50 text-emerald-700"],
              ["Attention", deliveries.filter((item) => item.status === "failed" || item.status === "warning").length, AlertTriangle, "bg-rose-50 text-rose-700"],
              ["Pending", deliveries.filter((item) => item.status === "pending").length, CircleDashed, "bg-amber-50 text-amber-700"],
            ].map(([label, value, Icon, klass]) => (
              <div key={String(label)} className={`rounded-xl p-4 ${klass}`}>
                <Icon className="h-4 w-4" />
                <p className="mt-3 text-2xl font-bold">{value}</p>
                <p className="text-xs font-semibold opacity-70">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-slate-900">Delivery matrix</p>
              <p className="mt-1 text-xs text-slate-500">Failures and warnings stay actionable without leaving the campaign.</p>
            </div>
            <button className="min-h-10 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white">Retry failed</button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-start text-sm">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-400">
                <tr>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Destination</th>
                  <th className="px-4 py-3">Chat</th>
                  <th className="px-4 py-3">Attempts</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deliveries.map((delivery) => (
                  <tr key={delivery.id}>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${
                        delivery.status === "success"
                          ? "bg-emerald-100 text-emerald-700"
                          : delivery.status === "failed"
                            ? "bg-rose-100 text-rose-700"
                            : delivery.status === "warning"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-slate-100 text-slate-600"
                      }`}>
                        {delivery.status}
                      </span>
                    </td>
                    <td className="max-w-[260px] px-4 py-3">
                      <p className="truncate font-bold text-slate-800" dir="auto">{delivery.target.name}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400" dir="ltr">{delivery.target.chatId}</td>
                    <td className="px-4 py-3 font-bold text-slate-700">{delivery.attempts}</td>
                    <td className="px-4 py-3">
                      {delivery.status === "failed" || delivery.status === "warning" ? (
                        <button className="text-xs font-bold text-rose-600">Inspect & retry</button>
                      ) : (
                        <span className="text-xs text-slate-400">No action</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function PromotionWorkspacePrototype() {
  const [variant, setVariant] = useState<Variant>("control");
  const [rtl, setRtl] = useState(false);
  const [stress, setStress] = useState(false);
  const campaigns = stress ? stressCampaigns : normalCampaigns;
  const posts = stress ? stressPosts : normalPosts;
  const targets = stress ? stressTargets : normalTargets;
  const [selectedCampaignId, setSelectedCampaignId] = useState(normalCampaigns[0].id);
  const campaign = campaigns.find((item) => item.id === selectedCampaignId) || campaigns[0];

  const setStressMode = (next: boolean) => {
    setStress(next);
    setSelectedCampaignId((next ? stressCampaigns : normalCampaigns)[0].id);
  };

  return (
    <div dir={rtl ? "rtl" : "ltr"} className="min-h-[100dvh] bg-slate-100/70 text-slate-950">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-[1720px] flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">Prototype · Promotion Workspace V2</p>
            <h1 className="mt-1 truncate font-display text-xl font-bold text-slate-950">{labels[variant].name}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{labels[variant].description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["control", "builder", "operations"] as Variant[]).map((item, index) => (
              <button
                key={item}
                type="button"
                onClick={() => setVariant(item)}
                className={`min-h-10 rounded-xl border px-3 text-sm font-bold ${
                  variant === item ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                {index + 1}. {labels[item].name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setStressMode(!stress)}
              className={`min-h-10 rounded-xl border px-3 text-sm font-bold ${stress ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-white text-slate-600"}`}
            >
              {stress ? "Worst-case data" : "Normal data"}
            </button>
            <button
              type="button"
              onClick={() => setRtl(!rtl)}
              className={`min-h-10 rounded-xl border px-3 text-sm font-bold ${rtl ? "border-violet-200 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-600"}`}
            >
              {rtl ? "RTL" : "LTR"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1760px] px-4 py-5 sm:px-6 xl:px-8">
        <section className="mb-4 flex flex-col gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/80 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-slate-800">Isolated campaign experiment</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Mock data only. No Telegram delivery, Supabase mutation, bot, AI, retry, or launch action is connected.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Pill><Megaphone className="me-1 h-3.5 w-3.5" /> 128 campaigns</Pill>
            <Pill><Target className="me-1 h-3.5 w-3.5" /> 47 targets</Pill>
            <Pill><ShieldCheck className="me-1 h-3.5 w-3.5" /> EN · RU · AR · FA</Pill>
          </div>
        </section>

        {variant === "control" ? (
          <ControlRoom campaigns={campaigns} posts={posts} targets={targets} campaign={campaign} setCampaign={(next) => setSelectedCampaignId(next.id)} />
        ) : variant === "builder" ? (
          <GuidedBuilder posts={posts} targets={targets} campaign={campaign} />
        ) : (
          <DeliveryOperations campaigns={campaigns} campaign={campaign} setCampaign={(next) => setSelectedCampaignId(next.id)} targets={targets} />
        )}
      </main>
    </div>
  );
}
