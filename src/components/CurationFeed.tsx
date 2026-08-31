import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  Hash,
  Inbox,
  Languages,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import type { CuratedPost, DestinationTarget } from "../types";
import { AI_CONNECTION_FALLBACK_ERROR, AI_CURATION_FALLBACK_ERROR } from "../utils/aiErrors";
import { safeResponseJson } from "../utils/api";

interface CurationFeedProps {
  initialTab?: TabType;
  isBotConfigured: boolean;
  isScraping: boolean;
  onPostToTelegram: (postId: string, editedText: string, photoUrl?: string) => Promise<boolean>;
  onTriggerScrape: () => void;
  onUpdatePost: (postId: string, updatedFields: Partial<CuratedPost>) => void | Promise<void>;
  posts: CuratedPost[];
  targets?: DestinationTarget[];
}

type TabType = "pending" | "approved" | "posted" | "archived";
type MobileReviewView = "original" | "edit" | "preview";

interface AiSuggestion {
  action: string;
  original: string;
  result: string;
}

const tones = ["Professional", "Casual", "Punchy & Viral", "Insightful News", "Bullet Summary"];
const languages = ["English", "Spanish", "Russian", "French", "German", "Chinese", "Arabic"];

const tabLabels: Record<TabType, string> = {
  pending: "Pending",
  approved: "Approved",
  posted: "Published",
  archived: "Archived",
};

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  });
}

function initials(channel: string) {
  return channel.replace(/^@/, "").slice(0, 2).toUpperCase();
}

function statusClasses(status: CuratedPost["status"]) {
  if (status === "approved") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "posted") return "bg-sky-50 text-sky-700 border-sky-200";
  if (status === "archived") return "bg-slate-100 text-slate-600 border-slate-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function OriginalPostPanel({ post }: { post: CuratedPost }) {
  return (
    <section className="flex h-full min-h-0 flex-col bg-white" aria-label="Original post">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-950">Original post</h2>
            <div className="mt-2 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-100 text-sm font-bold text-sky-700">
                {initials(post.channelUsername)}
              </span>
              <div>
                <p className="text-sm font-bold text-sky-700">@{post.channelUsername}</p>
                <p className="text-xs text-slate-500">{formatDate(post.date)}</p>
              </div>
            </div>
          </div>
          <a
            href={post.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-sky-600 hover:bg-sky-50"
          >
            Open <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <p className="whitespace-pre-wrap text-[15px] leading-7 text-slate-700">{post.originalText || "This Telegram post contains media without a text caption."}</p>
        {post.videoUrl ? (
          <video src={post.videoUrl} controls preload="metadata" className="mt-5 max-h-80 w-full rounded-2xl bg-slate-950 object-contain" />
        ) : post.photoUrl ? (
          <img src={post.photoUrl} alt="Telegram post attachment" referrerPolicy="no-referrer" className="mt-5 max-h-80 w-full rounded-2xl bg-slate-950 object-contain" />
        ) : null}
      </div>
    </section>
  );
}

function TelegramPreview({ post, text }: { post: CuratedPost; text: string }) {
  return (
    <div className="rounded-2xl bg-[#dcebd2] p-4 shadow-inner">
      <div className="ml-auto max-w-md rounded-2xl rounded-br-md bg-white px-4 py-3 shadow-sm">
        <p className="text-sm font-bold text-sky-700">TGReposter</p>
        <p className="mt-1 whitespace-pre-wrap text-[15px] leading-6 text-slate-800">{text || "Your curated Telegram message will appear here."}</p>
        <div className="mt-2 flex items-center justify-end gap-1 text-xs text-slate-400">
          Preview <Check className="h-3.5 w-3.5 text-sky-500" aria-hidden="true" />
        </div>
      </div>
      <p className="mt-2 text-xs font-semibold text-slate-600">Source: @{post.channelUsername}</p>
    </div>
  );
}

function AiSuggestionCard({ suggestion, onApply, onDismiss }: { suggestion: AiSuggestion; onApply: () => void; onDismiss: () => void }) {
  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-4" role="status">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900">AI draft ready</p>
          <p className="mt-1 text-sm text-slate-600">Review the {suggestion.action.toLowerCase()} suggestion before applying it.</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-rose-100 bg-white p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-rose-600">Before</p>
          <p className="mt-1 line-clamp-3 text-sm leading-6 text-slate-600">{suggestion.original}</p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-white p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-600">After</p>
          <p className="mt-1 line-clamp-3 text-sm leading-6 text-slate-700">{suggestion.result}</p>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onDismiss} className="min-h-11 rounded-xl px-4 text-sm font-bold text-violet-700 hover:bg-violet-100">Dismiss</button>
        <button type="button" onClick={onApply} className="min-h-11 rounded-xl bg-violet-600 px-5 text-sm font-bold text-white hover:bg-violet-700">Apply</button>
      </div>
    </div>
  );
}

export default function CurationFeed({
  initialTab = "pending",
  isBotConfigured,
  isScraping,
  onPostToTelegram,
  onTriggerScrape,
  onUpdatePost,
  posts,
  targets,
}: CurationFeedProps) {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [activeTone, setActiveTone] = useState("Professional");
  const [activeLanguage, setActiveLanguage] = useState("English");
  const [aiLoadingAction, setAiLoadingAction] = useState<string | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<AiSuggestion | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: "error" | "success" } | null>(null);
  const [mobileReviewOpen, setMobileReviewOpen] = useState(false);
  const [mobileReviewView, setMobileReviewView] = useState<MobileReviewView>("edit");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!mobileReviewOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileReviewOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileReviewOpen]);

  const tabCounts = useMemo(
    () =>
      posts.reduce<Record<TabType, number>>(
        (counts, post) => {
          counts[post.status] += 1;
          return counts;
        },
        { pending: 0, approved: 0, posted: 0, archived: 0 },
      ),
    [posts],
  );

  const filteredPosts = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return posts.filter((post) => {
      if (post.status !== activeTab) return false;
      if (!normalizedQuery) return true;
      return [post.originalText, post.text, post.channelUsername].some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [activeTab, posts, searchQuery]);

  const selectedPost = useMemo(
    () => filteredPosts.find((post) => post.id === selectedPostId) || filteredPosts[0] || null,
    [filteredPosts, selectedPostId],
  );

  useEffect(() => {
    if (selectedPost && selectedPost.id !== selectedPostId) setSelectedPostId(selectedPost.id);
    if (!selectedPost && selectedPostId) setSelectedPostId(null);
  }, [selectedPost, selectedPostId]);

  useEffect(() => {
    setDraftText(selectedPost?.text || "");
    setAiSuggestion(null);
    setFeedback(null);
    setCopied(false);
  }, [selectedPost?.id, selectedPost?.text]);

  const enabledTargets = targets?.filter((target) => target.enabled) || [];
  const isDirty = Boolean(selectedPost && draftText !== selectedPost.text);

  const selectPost = (post: CuratedPost, openMobile = false) => {
    setSelectedPostId(post.id);
    setMobileReviewView("edit");
    if (openMobile) setMobileReviewOpen(true);
  };

  const saveDraft = async () => {
    if (!selectedPost || !isDirty) return;
    await onUpdatePost(selectedPost.id, { text: draftText });
    setFeedback({ message: "Draft saved.", type: "success" });
  };

  const approvePost = async () => {
    if (!selectedPost) return;
    await onUpdatePost(selectedPost.id, { status: "approved", text: draftText });
    setFeedback({ message: "Post approved and moved to the approved queue.", type: "success" });
  };

  const publishPost = async () => {
    if (!selectedPost) return;
    if (!isBotConfigured) {
      setFeedback({ message: "Configure and enable a Telegram destination before publishing.", type: "error" });
      return;
    }
    if (isDirty) await onUpdatePost(selectedPost.id, { text: draftText });
    setPublishingId(selectedPost.id);
    try {
      const success = await onPostToTelegram(selectedPost.id, draftText, selectedPost.photoUrl);
      setFeedback({
        message: success ? "Published successfully to the selected Telegram destinations." : "Publishing failed. Review the destination error and try again.",
        type: success ? "success" : "error",
      });
      if (success) setMobileReviewOpen(false);
    } finally {
      setPublishingId(null);
    }
  };

  const archivePost = async () => {
    if (!selectedPost) return;
    await onUpdatePost(selectedPost.id, { status: selectedPost.status === "archived" ? "pending" : "archived" });
  };

  const copyDraft = async () => {
    await navigator.clipboard.writeText(draftText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const runAiAction = async (action: string, context?: string) => {
    if (!selectedPost) return;
    setAiLoadingAction(action);
    setFeedback(null);
    try {
      const token = localStorage.getItem("curator_token");
      const response = await fetch("/api/ai/curate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action, context, text: draftText }),
      });
      const data = await safeResponseJson(response);
      if (!response.ok || !data.result) throw new Error(data.error || AI_CURATION_FALLBACK_ERROR);
      const result = action === "hashtags" ? [draftText.trim(), String(data.result).trim()].filter(Boolean).join("\n\n") : String(data.result).trim();
      setAiSuggestion({ action, original: draftText, result });
    } catch (error: any) {
      setFeedback({ message: error.message || AI_CONNECTION_FALLBACK_ERROR, type: "error" });
    } finally {
      setAiLoadingAction(null);
    }
  };

  const applySuggestion = () => {
    if (!aiSuggestion) return;
    setDraftText(aiSuggestion.result);
    setAiSuggestion(null);
    setFeedback({ message: "AI suggestion applied. Save or approve when ready.", type: "success" });
  };

  const renderStatusTabs = (mobile = false) => (
    <div className={`flex gap-2 ${mobile ? "overflow-x-auto pb-1" : "flex-wrap"}`} role="tablist" aria-label="Post status">
      {(Object.keys(tabLabels) as TabType[]).map((tab) => (
        <button
          type="button"
          key={tab}
          role="tab"
          aria-selected={activeTab === tab}
          onClick={() => {
            setActiveTab(tab);
            setMobileReviewOpen(false);
          }}
          className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-bold transition-colors ${
            activeTab === tab
              ? "border-slate-950 bg-slate-950 text-white"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          {tabLabels[tab]}
          <span className={`rounded-full px-2 py-0.5 text-xs ${activeTab === tab ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600"}`}>
            {tabCounts[tab]}
          </span>
        </button>
      ))}
    </div>
  );

  const renderAiTools = () => (
    <section className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4" aria-label="AI Curation Toolkit">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-violet-800">
          <WandSparkles className="h-5 w-5" aria-hidden="true" /> AI Curation Toolkit
        </h3>
        {aiLoadingAction ? <span className="flex items-center gap-1.5 text-xs font-semibold text-violet-600"><RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Generating</span> : null}
      </div>
      <p className="mt-1 text-xs leading-5 text-violet-700">Powered by server-side AI. Use these review-only actions to edit posts using AI.</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
        <button type="button" disabled={Boolean(aiLoadingAction)} onClick={() => runAiAction("rephrase", activeTone)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-3 text-sm font-bold text-violet-700 hover:bg-violet-50 disabled:opacity-50">
          <Sparkles className="h-4 w-4" aria-hidden="true" /> Rephrase
        </button>
        <button type="button" disabled={Boolean(aiLoadingAction)} onClick={() => runAiAction("summarize")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-3 text-sm font-bold text-violet-700 hover:bg-violet-50 disabled:opacity-50">
          <FileText className="h-4 w-4" aria-hidden="true" /> Summarize
        </button>
        <button type="button" disabled={Boolean(aiLoadingAction)} onClick={() => runAiAction("translate", activeLanguage)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-3 text-sm font-bold text-violet-700 hover:bg-violet-50 disabled:opacity-50">
          <Languages className="h-4 w-4" aria-hidden="true" /> Translate
        </button>
        <button type="button" disabled={Boolean(aiLoadingAction)} onClick={() => runAiAction("hashtags")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-3 text-sm font-bold text-violet-700 hover:bg-violet-50 disabled:opacity-50">
          <Hash className="h-4 w-4" aria-hidden="true" /> Hashtags
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-xs font-bold text-slate-600">
          Tone
          <select value={activeTone} onChange={(event) => setActiveTone(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-800 xl:text-sm">
            {tones.map((tone) => <option key={tone}>{tone}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-600">
          Language
          <select value={activeLanguage} onChange={(event) => setActiveLanguage(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-800 xl:text-sm">
            {languages.map((language) => <option key={language}>{language}</option>)}
          </select>
        </label>
      </div>
    </section>
  );

  const renderEditor = (showPreview = true) => {
    if (!selectedPost) return null;
    return (
      <section className="space-y-4">
        <div>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold text-slate-950">Curated version</h2>
            <span className={`text-xs font-bold ${draftText.length > 4096 ? "text-rose-600" : "text-slate-500"}`}>{draftText.length} / 4096</span>
          </div>
          <textarea
            aria-label="Curated version"
            value={draftText}
            onChange={(event) => setDraftText(event.target.value)}
            rows={8}
            className="mt-2 w-full resize-y rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base leading-7 text-slate-900 outline-hidden transition-shadow focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
          />
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500">{isDirty ? "Unsaved changes" : "Draft is saved"}</p>
            <button type="button" onClick={copyDraft} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-slate-600 hover:bg-slate-100">
              {copied ? <Check className="h-4 w-4 text-emerald-500" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
        {renderAiTools()}
        {aiSuggestion ? <AiSuggestionCard suggestion={aiSuggestion} onApply={applySuggestion} onDismiss={() => setAiSuggestion(null)} /> : null}
        {showPreview ? (
          <div>
            <h3 className="mb-2 text-sm font-bold text-slate-800">Telegram preview</h3>
            <TelegramPreview post={selectedPost} text={draftText} />
          </div>
        ) : null}
        {feedback ? (
          <div className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${feedback.type === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`} role={feedback.type === "error" ? "alert" : "status"}>
            {feedback.type === "error" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
            <span>{feedback.message}</span>
          </div>
        ) : null}
      </section>
    );
  };

  const renderDestinationSummary = () => (
    <div className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-left">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><Send className="h-4 w-4 -rotate-12" aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-slate-900">{enabledTargets.length} destination{enabledTargets.length === 1 ? "" : "s"} selected</span>
        <span className="block truncate text-xs text-slate-500">{enabledTargets.length > 0 ? enabledTargets.map((target) => target.name).join(", ") : "No Telegram destinations enabled"}</span>
      </span>
      <ChevronRight className="h-5 w-5 text-slate-400" aria-hidden="true" />
    </div>
  );

  const renderActions = (mobile = false) => {
    if (!selectedPost) return null;
    const publishing = publishingId === selectedPost.id;
    return (
      <div className={`flex gap-2 ${mobile ? "grid grid-cols-3" : "flex-wrap justify-end"}`}>
        <button type="button" onClick={saveDraft} disabled={!isDirty} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-white px-4 text-sm font-bold text-sky-700 hover:bg-sky-50 disabled:border-slate-200 disabled:text-slate-400">
          <FileText className="h-4 w-4" aria-hidden="true" /> <span className={mobile ? "hidden min-[370px]:inline" : ""}>Save draft</span>
        </button>
        <button type="button" onClick={approvePost} disabled={selectedPost.status === "posted"} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-emerald-600 bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:border-slate-300 disabled:bg-slate-300">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Approve
        </button>
        <button type="button" onClick={publishPost} disabled={publishing || selectedPost.status === "posted"} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 text-sm font-bold text-white shadow-sm hover:bg-sky-700 disabled:bg-slate-300">
          {publishing ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4 -rotate-12" aria-hidden="true" />}
          {publishing ? "Publishing" : "Publish"}
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="hidden xl:block">{renderStatusTabs()}</div>
          <div className="xl:hidden">{renderStatusTabs(true)}</div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative block min-w-0 sm:w-80">
              <span className="sr-only">Search posts or channels</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search posts or channels" className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-base outline-hidden focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100 xl:text-sm" />
            </label>
            <button type="button" onClick={onTriggerScrape} disabled={isScraping} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 text-sm font-bold text-sky-700 hover:bg-sky-100 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${isScraping ? "animate-spin" : ""}`} aria-hidden="true" />
              {isScraping ? "Syncing" : "Sync sources"}
            </button>
          </div>
        </div>
      </section>

      {filteredPosts.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-16 text-center shadow-xs">
          <Inbox className="mx-auto h-12 w-12 text-slate-300" aria-hidden="true" />
          <h2 className="mt-4 font-display text-lg font-bold text-slate-800">No {tabLabels[activeTab].toLowerCase()} posts</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{searchQuery ? "No posts match this search. Try another channel or phrase." : "Sync your source channels to collect fresh Telegram content."}</p>
          {!searchQuery && activeTab === "pending" ? (
            <button type="button" onClick={onTriggerScrape} disabled={isScraping} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-600 px-5 text-sm font-bold text-white hover:bg-sky-700">
              <RefreshCw className={`h-4 w-4 ${isScraping ? "animate-spin" : ""}`} aria-hidden="true" /> Sync sources
            </button>
          ) : null}
        </section>
      ) : (
        <>
          <section className="hidden h-[calc(100vh-10.5rem)] min-h-[660px] grid-cols-[300px_minmax(0,0.92fr)_minmax(420px,1.08fr)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs xl:grid">
            <aside className="flex min-h-0 flex-col border-r border-slate-200" aria-label="Post queue">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
                <div><h2 className="font-display text-lg font-bold text-slate-950">Post queue</h2><p className="text-xs text-slate-500">{filteredPosts.length} {tabLabels[activeTab].toLowerCase()}</p></div>
              </div>
              <div className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
                {filteredPosts.map((post) => (
                  <button type="button" key={post.id} onClick={() => selectPost(post)} aria-current={selectedPost?.id === post.id ? "true" : undefined} className={`flex w-full gap-3 px-4 py-4 text-left transition-colors ${selectedPost?.id === post.id ? "bg-sky-50 ring-1 ring-inset ring-sky-200" : "hover:bg-slate-50"}`}>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">{initials(post.channelUsername)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-bold text-sky-700">@{post.channelUsername}</span><span className="shrink-0 text-xs text-slate-400">{formatDate(post.date)}</span></span>
                      <span className="mt-1 line-clamp-2 text-sm leading-5 text-slate-600">{post.originalText || "Media post"}</span>
                      <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-xs font-bold ${statusClasses(post.status)}`}>{tabLabels[post.status]}</span>
                    </span>
                    {post.photoUrl ? <img src={post.photoUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg bg-slate-100 object-cover" /> : null}
                  </button>
                ))}
              </div>
            </aside>

            {selectedPost ? <OriginalPostPanel post={selectedPost} /> : null}

            {selectedPost ? (
              <section className="flex min-h-0 flex-col border-l border-slate-200 bg-slate-50/40" aria-label="Curated post editor">
                <div className="min-h-0 flex-1 overflow-y-auto p-5">{renderEditor()}</div>
                <div className="border-t border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0"><p className="text-sm font-bold text-slate-900">Publishing to {enabledTargets.length} destination{enabledTargets.length === 1 ? "" : "s"}</p><p className="truncate text-xs text-slate-500">{enabledTargets.length ? enabledTargets.map((target) => target.name).join(", ") : "Configure a Telegram destination to publish"}</p></div>
                    <button type="button" onClick={archivePost} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-slate-500 hover:bg-slate-100 hover:text-rose-600"><Archive className="h-4 w-4" aria-hidden="true" /> {selectedPost.status === "archived" ? "Restore" : "Archive"}</button>
                  </div>
                  {renderActions()}
                </div>
              </section>
            ) : null}
          </section>

          <section className="space-y-3 xl:hidden" aria-label="Mobile post list">
            {filteredPosts.map((post) => (
              <button type="button" key={post.id} onClick={() => selectPost(post, true)} className={`content-visibility-auto flex w-full gap-3 rounded-2xl border bg-white p-4 text-left shadow-xs transition-colors ${post.errorMessage ? "border-rose-200" : "border-slate-200 hover:border-sky-300"}`}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">{initials(post.channelUsername)}</span>
                <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-base font-bold text-slate-900">@{post.channelUsername}</span><span className="shrink-0 text-sm text-slate-400">{formatDate(post.date)}</span></span><span className="mt-2 line-clamp-3 text-[15px] leading-6 text-slate-600">{post.originalText || "Media post"}</span><span className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusClasses(post.status)}`}>{tabLabels[post.status]}</span></span>
                {post.photoUrl ? <img src={post.photoUrl} alt="" className="h-20 w-20 shrink-0 rounded-xl bg-slate-100 object-cover" /> : <ChevronRight className="mt-2 h-5 w-5 shrink-0 text-slate-300" aria-hidden="true" />}
              </button>
            ))}
          </section>
        </>
      )}

      {mobileReviewOpen && selectedPost ? (
        <div role="dialog" aria-modal="true" aria-label="Review post" className="fixed inset-0 z-[80] flex flex-col bg-slate-50 xl:hidden">
          <header className="flex min-h-16 items-center justify-between border-b border-slate-200 bg-white px-3 pt-[env(safe-area-inset-top)]">
            <button type="button" autoFocus onClick={() => setMobileReviewOpen(false)} aria-label="Back to post list" className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100"><ArrowLeft className="h-5 w-5" aria-hidden="true" /></button>
            <div className="text-center"><h1 className="font-display text-lg font-bold text-slate-950">Review post</h1><p className="text-xs font-semibold text-slate-500">{filteredPosts.findIndex((post) => post.id === selectedPost.id) + 1} of {filteredPosts.length}</p></div>
            <span className="h-11 w-11" aria-hidden="true" />
          </header>

          <div className="border-b border-slate-200 bg-white px-4 py-3">
            <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 text-center">
              <div><span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-sky-600 text-sm font-bold text-white">1</span><p className="mt-1 text-xs font-bold text-sky-600">Review</p></div><div className="h-px w-full bg-slate-200" /><div><span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500">2</span><p className="mt-1 text-xs font-semibold text-slate-500">Approve</p></div><div className="h-px w-full bg-slate-200" /><div><span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500">3</span><p className="mt-1 text-xs font-semibold text-slate-500">Publish</p></div>
            </div>
            <div className="mt-3 grid grid-cols-3 rounded-xl border border-slate-200 bg-slate-50 p-1" role="tablist" aria-label="Review mode">
              {(["original", "edit", "preview"] as MobileReviewView[]).map((view) => <button type="button" key={view} role="tab" aria-selected={mobileReviewView === view} onClick={() => setMobileReviewView(view)} className={`min-h-11 rounded-lg text-sm font-bold capitalize ${mobileReviewView === view ? "bg-white text-sky-700 shadow-xs" : "text-slate-500"}`}>{view}</button>)}
            </div>
          </div>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-8">
            <div className="mx-auto max-w-2xl space-y-4">
              <section className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">{initials(selectedPost.channelUsername)}</span><div className="min-w-0 flex-1"><p className="truncate text-base font-bold text-slate-900">@{selectedPost.channelUsername}</p><p className="text-sm text-slate-500">{formatDate(selectedPost.date)}</p></div><a href={selectedPost.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-bold text-sky-600">Open original <ExternalLink className="h-4 w-4" aria-hidden="true" /></a>
              </section>

              {mobileReviewView === "original" ? <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><OriginalPostPanel post={selectedPost} /></div> : null}
              {mobileReviewView === "edit" ? (
                <>
                  <details className="group rounded-2xl border border-slate-200 bg-white p-4"><summary className="flex cursor-pointer list-none items-center gap-3"><FileText className="h-5 w-5 text-slate-600" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900">Original content summary</span><span className="block text-xs text-slate-500">{selectedPost.originalText.length.toLocaleString()} characters{selectedPost.photoUrl || selectedPost.videoUrl ? " · media attached" : ""}</span></span><ChevronDown className="h-5 w-5 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" /></summary><p className="mt-4 whitespace-pre-wrap border-t border-slate-100 pt-4 text-[15px] leading-7 text-slate-600">{selectedPost.originalText}</p></details>
                  {renderEditor(false)}
                  {renderDestinationSummary()}
                </>
              ) : null}
              {mobileReviewView === "preview" ? <div className="space-y-4"><div><h2 className="mb-2 font-display text-lg font-bold text-slate-950">Telegram preview</h2><TelegramPreview post={selectedPost} text={draftText} /></div>{renderDestinationSummary()}{feedback ? <div className={`rounded-xl border p-3 text-sm ${feedback.type === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{feedback.message}</div> : null}</div> : null}
            </div>
          </main>

          <footer className="border-t border-slate-200 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)]"><div className="mx-auto max-w-2xl">{renderActions(true)}</div></footer>
        </div>
      ) : null}
    </div>
  );
}
