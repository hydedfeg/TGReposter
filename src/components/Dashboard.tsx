import {
  AlertCircle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock3,
  Inbox,
  Megaphone,
  Radio,
  RefreshCw,
  Send,
} from "lucide-react";
import type { CuratedPost, CuratorSettings } from "../types";
import type { WorkspaceView } from "./AppShell";

interface DashboardProps {
  isSyncing: boolean;
  onNavigate: (view: WorkspaceView) => void;
  onSync: () => void;
  settings: CuratorSettings;
}

function isToday(value?: string) {
  if (!value) return false;
  const date = new Date(value);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
}

function recentPosts(posts: CuratedPost[]) {
  return [...posts].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()).slice(0, 4);
}

function activityForLastSevenDays(posts: CuratedPost[]) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const count = posts.filter((post) => {
      if (!post.postedAt) return false;
      const posted = new Date(post.postedAt);
      return posted.getFullYear() === date.getFullYear() && posted.getMonth() === date.getMonth() && posted.getDate() === date.getDate();
    }).length;
    return {
      count,
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
    };
  });
}

export default function Dashboard({ isSyncing, onNavigate, onSync, settings }: DashboardProps) {
  const activeTargets = settings.destination.targets?.filter((target) => target.enabled).length || 0;
  const pending = settings.posts.filter((post) => post.status === "pending").length;
  const publishedToday = settings.posts.filter((post) => post.status === "posted" && isToday(post.postedAt)).length;
  const failed = settings.posts.filter((post) => Boolean(post.errorMessage)).length;
  const posted = settings.posts.filter((post) => post.status === "posted").length;
  const successRate = posted + failed === 0 ? 100 : Math.round((posted / (posted + failed)) * 1000) / 10;
  const activity = activityForLastSevenDays(settings.posts);
  const maxActivity = Math.max(...activity.map((item) => item.count), 1);
  const queue = recentPosts(settings.posts.filter((post) => post.status === "pending"));

  const stats = [
    { label: "Source Channels", value: settings.channels.length, icon: Radio, tone: "bg-sky-50 text-sky-600" },
    { label: "Destinations", value: activeTargets, icon: Bot, tone: "bg-emerald-50 text-emerald-600" },
    { label: "Pending Review", value: pending, icon: Inbox, tone: "bg-amber-50 text-amber-600" },
    { label: "Published Today", value: publishedToday, icon: CheckCircle2, tone: "bg-violet-50 text-violet-600" },
  ];

  return (
    <div className="space-y-5 sm:space-y-6">
      <section>
        <p className="text-sm font-semibold text-sky-600">Content operations</p>
        <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">At a glance</h1>
            <p className="mt-1 text-sm text-slate-500 sm:text-base">Review the queue, monitor delivery health, and keep Telegram publishing moving.</p>
          </div>
          <button
            type="button"
            onClick={onSync}
            disabled={isSyncing || settings.channels.length === 0}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:bg-slate-300 sm:w-auto"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} aria-hidden="true" />
            {isSyncing ? "Syncing sources" : "Sync sources"}
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Workspace metrics">
        {stats.map(({ icon: Icon, label, tone, value }) => (
          <article key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="mt-4 text-2xl font-bold text-slate-950 sm:text-3xl">{value}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">{label}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-950">Publication activity</h2>
              <p className="text-sm text-slate-500">Posts published during the last seven days</p>
            </div>
            <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">Last 7 days</span>
          </div>
          <div className="mt-6 grid h-52 grid-cols-7 items-end gap-2 border-b border-slate-200 px-1 sm:gap-4" aria-label="Seven-day publication chart">
            {activity.map((item) => (
              <div key={item.label} className="flex h-full flex-col justify-end gap-2 text-center">
                <span className="text-xs font-bold text-slate-500">{item.count}</span>
                <div
                  className="mx-auto w-full max-w-10 rounded-t-lg bg-sky-500 transition-[height]"
                  style={{ height: `${Math.max(8, (item.count / maxActivity) * 132)}px` }}
                />
                <span className="pb-2 text-xs font-semibold text-slate-500">{item.label}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-950">Review queue</h2>
              <p className="text-sm text-slate-500">Newest posts needing attention</p>
            </div>
            <button type="button" onClick={() => onNavigate("feed")} className="min-h-11 rounded-lg px-2 text-sm font-bold text-sky-600 hover:bg-sky-50">
              View all
            </button>
          </div>
          {queue.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {queue.map((post) => (
                <button
                  type="button"
                  key={post.id}
                  onClick={() => onNavigate("feed")}
                  className="flex min-h-20 w-full items-center gap-3 px-5 py-3 text-left hover:bg-slate-50"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm font-bold text-sky-700">
                    {post.channelUsername.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-900">@{post.channelUsername}</span>
                    <span className="mt-1 block truncate text-sm text-slate-500">{post.originalText || "Media post"}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : (
            <div className="px-5 py-10 text-center">
              <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" aria-hidden="true" />
              <p className="mt-3 text-sm font-bold text-slate-800">Review queue is clear</p>
              <p className="mt-1 text-sm text-slate-500">Sync sources to look for new matching posts.</p>
            </div>
          )}
        </article>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <h2 className="font-display text-lg font-bold text-slate-950">Publishing health</h2>
          <div className="mt-5 grid grid-cols-3 divide-x divide-slate-100">
            <div className="pr-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-500" aria-hidden="true" />
              <p className="mt-3 text-xl font-bold sm:text-2xl">{successRate}%</p>
              <p className="text-sm text-slate-500">Success rate</p>
            </div>
            <div className="px-3">
              <Send className="h-6 w-6 -rotate-12 text-sky-500" aria-hidden="true" />
              <p className="mt-3 text-xl font-bold sm:text-2xl">{activeTargets}</p>
              <p className="text-sm text-slate-500">Active targets</p>
            </div>
            <div className="pl-3">
              {failed > 0 ? <AlertCircle className="h-6 w-6 text-rose-500" aria-hidden="true" /> : <Clock3 className="h-6 w-6 text-slate-400" aria-hidden="true" />}
              <p className="mt-3 text-xl font-bold sm:text-2xl">{failed}</p>
              <p className="text-sm text-slate-500">Need attention</p>
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <h2 className="font-display text-lg font-bold text-slate-950">Quick actions</h2>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button type="button" onClick={onSync} className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-slate-50 px-3 text-sm font-bold text-slate-700 hover:bg-slate-100">
              <RefreshCw className="h-5 w-5 text-sky-600" aria-hidden="true" /> Sync sources
            </button>
            <button type="button" onClick={() => onNavigate("feed")} className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-slate-50 px-3 text-sm font-bold text-slate-700 hover:bg-slate-100">
              <Inbox className="h-5 w-5 text-violet-600" aria-hidden="true" /> Review posts
            </button>
            <button type="button" onClick={() => onNavigate("promotion")} className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-slate-50 px-3 text-sm font-bold text-slate-700 hover:bg-slate-100">
              <Megaphone className="h-5 w-5 text-emerald-600" aria-hidden="true" /> Create campaign
            </button>
          </div>
        </article>
      </section>
    </div>
  );
}
