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
import { useTranslation } from "react-i18next";
import { normalizeAppLocale } from "../i18n";
import { AI_OUTPUT_LANGUAGE_IDS, type AIOutputLanguageId } from "../../shared/aiLanguages";
import type { CuratedPost, DestinationTarget } from "../types";
import { AI_CONNECTION_FALLBACK_ERROR, AI_CURATION_FALLBACK_ERROR } from "../utils/aiErrors";
import { safeResponseJson } from "../utils/api";
import { getInitials } from "../utils/text";

interface CurationFeedProps {
  initialTab?: TabType;
  mode?: "review" | "history";
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

interface Feedback {
  message?: string;
  messageKey?: string;
  type: "error" | "success";
}

const toneOptions = [
  { value: "Professional", labelKey: "ai.tones.professional" },
  { value: "Casual", labelKey: "ai.tones.casual" },
  { value: "Punchy & Viral", labelKey: "ai.tones.viral" },
  { value: "Insightful News", labelKey: "ai.tones.news" },
  { value: "Bullet Summary", labelKey: "ai.tones.bullets" },
] as const;

const tabs: TabType[] = ["pending", "approved", "posted", "archived"];

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(`${locale}-u-ca-gregory`, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function statusClasses(status: CuratedPost["status"]) {
  if (status === "approved") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "posted") return "bg-sky-50 text-sky-700 border-sky-200";
  if (status === "archived") return "bg-slate-100 text-slate-600 border-slate-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function OriginalPostPanel({ post }: { post: CuratedPost }) {
  const { t, i18n } = useTranslation("inbox");
  const locale = normalizeAppLocale(i18n.language);

  return (
    <section className="flex h-full min-h-0 flex-col bg-white" aria-label={t("accessibility.originalPost")}>
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold text-slate-950">{t("original.title")}</h2>
            <div className="mt-2 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-100 text-sm font-bold text-sky-700">
                {getInitials(post.channelUsername, "TG")}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-sky-700" dir="ltr" title={post.channelUsername}>@{post.channelUsername}</p>
                <p className="text-xs text-slate-500">{formatDate(post.date, locale)}</p>
              </div>
            </div>
          </div>
          <a
            href={post.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-sky-600 hover:bg-sky-50"
          >
            {t("original.open")} <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <p className="whitespace-pre-wrap text-[15px] leading-7 text-slate-700" dir="auto">{post.originalText || t("original.mediaOnly")}</p>
        {post.videoUrl ? (
          <video src={post.videoUrl} controls preload="metadata" onError={(event) => { event.currentTarget.hidden = true; }} className="mt-5 max-h-80 w-full rounded-2xl bg-slate-950 object-contain" />
        ) : post.photoUrl ? (
          <img src={post.photoUrl} alt={t("original.attachmentAlt")} referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true; }} className="mt-5 max-h-80 w-full rounded-2xl bg-slate-950 object-contain" />
        ) : null}
      </div>
    </section>
  );
}

function TelegramPreview({ post, text }: { post: CuratedPost; text: string }) {
  const { t } = useTranslation("inbox");

  return (
    <div className="rounded-2xl bg-[#dcebd2] p-4 shadow-inner">
      <div className="ms-auto max-w-md rounded-2xl rounded-ee-md bg-white px-4 py-3 shadow-sm">
        <p className="text-sm font-bold text-sky-700">TGReposter</p>
        <p className="mt-1 whitespace-pre-wrap text-[15px] leading-6 text-slate-800" dir="auto">{text || t("preview.empty")}</p>
        <div className="mt-2 flex items-center justify-end gap-1 text-xs text-slate-400">
          {t("preview.label")} <Check className="h-3.5 w-3.5 text-sky-500" aria-hidden="true" />
        </div>
      </div>
      <p className="mt-2 text-xs font-semibold text-slate-600">{t("preview.source", { channel: post.channelUsername })}</p>
    </div>
  );
}

function AiSuggestionCard({ suggestion, onApply, onDismiss }: { suggestion: AiSuggestion; onApply: () => void; onDismiss: () => void }) {
  const { t } = useTranslation("inbox");
  const actionLabel = t(`ai.actions.${suggestion.action}`, { defaultValue: suggestion.action });

  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-4" role="status">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900">{t("ai.draftReady")}</p>
          <p className="mt-1 text-sm text-slate-600">{t("ai.suggestionDescription", { action: actionLabel })}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-rose-100 bg-white p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-rose-600">{t("ai.before")}</p>
          <p className="mt-1 line-clamp-3 text-sm leading-6 text-slate-600" dir="auto">{suggestion.original}</p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-white p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-600">{t("ai.after")}</p>
          <p className="mt-1 line-clamp-3 text-sm leading-6 text-slate-700" dir="auto">{suggestion.result}</p>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onDismiss} className="min-h-11 rounded-xl px-4 text-sm font-bold text-violet-700 hover:bg-violet-100">{t("ai.dismiss")}</button>
        <button type="button" onClick={onApply} className="min-h-11 rounded-xl bg-violet-600 px-5 text-sm font-bold text-white hover:bg-violet-700">{t("ai.apply")}</button>
      </div>
    </div>
  );
}

export default function CurationFeed({
  initialTab = "pending",
  mode = "review",
  isBotConfigured,
  isScraping,
  onPostToTelegram,
  onTriggerScrape,
  onUpdatePost,
  posts,
  targets,
}: CurationFeedProps) {
  const { t, i18n } = useTranslation("inbox");
  const { t: th } = useTranslation("history");
  const isHistory = mode === "history";
  const locale = normalizeAppLocale(i18n.language);
  const numberFormatter = new Intl.NumberFormat(locale);
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [activeTone, setActiveTone] = useState("Professional");
  const [activeLanguage, setActiveLanguage] = useState<AIOutputLanguageId>("en");
  const [aiLoadingAction, setAiLoadingAction] = useState<string | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<AiSuggestion | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [mobileReviewOpen, setMobileReviewOpen] = useState(false);
  const [mobileReviewView, setMobileReviewView] = useState<MobileReviewView>("edit");
  const [copied, setCopied] = useState(false);
  const [isDesktopWorkspace, setIsDesktopWorkspace] = useState(() =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
      ? window.matchMedia("(min-width: 1280px)").matches
      : false,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia("(min-width: 1280px)");
    const syncLayout = () => setIsDesktopWorkspace(mediaQuery.matches);
    syncLayout();
    mediaQuery.addEventListener("change", syncLayout);
    return () => mediaQuery.removeEventListener("change", syncLayout);
  }, []);

  useEffect(() => {
    setActiveTab(isHistory ? "posted" : initialTab);
  }, [initialTab, isHistory]);

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
      if (post.status !== (isHistory ? "posted" : activeTab)) return false;
      if (!normalizedQuery) return true;
      return [post.originalText, post.text, post.channelUsername].some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [activeTab, isHistory, posts, searchQuery]);

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
    setFeedback({ messageKey: "feedback.draftSaved", type: "success" });
  };

  const approvePost = async () => {
    if (!selectedPost) return;
    await onUpdatePost(selectedPost.id, { status: "approved", text: draftText });
    setFeedback({ messageKey: "feedback.approved", type: "success" });
  };

  const publishPost = async () => {
    if (!selectedPost) return;
    if (selectedPost.status !== "approved") {
      setFeedback({ messageKey: "feedback.approveBeforePublishing", type: "error" });
      return;
    }
    if (!isBotConfigured) {
      setFeedback({ messageKey: "feedback.destinationRequired", type: "error" });
      return;
    }
    if (isDirty) await onUpdatePost(selectedPost.id, { text: draftText });
    setPublishingId(selectedPost.id);
    try {
      const success = await onPostToTelegram(selectedPost.id, draftText, selectedPost.photoUrl);
      setFeedback({
        messageKey: success ? "feedback.publishSuccess" : "feedback.publishFailed",
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
        body: JSON.stringify({
          action,
          text: draftText,
          ...(action === "translate"
            ? { targetLanguage: activeLanguage }
            : context
              ? { context }
              : {}),
        }),
      });
      const data = await safeResponseJson(response);
      if (!response.ok || !data.result) throw new Error(data.error || AI_CURATION_FALLBACK_ERROR);
      const result = action === "hashtags" ? [draftText.trim(), String(data.result).trim()].filter(Boolean).join("\n\n") : String(data.result).trim();
      setAiSuggestion({ action, original: draftText, result });
    } catch (error: any) {
      const message = error?.message || AI_CONNECTION_FALLBACK_ERROR;
      if (message === AI_CURATION_FALLBACK_ERROR) {
        setFeedback({ messageKey: "feedback.aiCurationError", type: "error" });
      } else if (message === AI_CONNECTION_FALLBACK_ERROR) {
        setFeedback({ messageKey: "feedback.aiConnectionError", type: "error" });
      } else {
        setFeedback({ message, type: "error" });
      }
    } finally {
      setAiLoadingAction(null);
    }
  };

  const applySuggestion = () => {
    if (!aiSuggestion) return;
    setDraftText(aiSuggestion.result);
    setAiSuggestion(null);
    setFeedback({ messageKey: "feedback.suggestionApplied", type: "success" });
  };

  const renderStatusTabs = (mobile = false) => (
    <div className={`flex gap-2 ${mobile ? "overflow-x-auto pb-1" : "flex-wrap"}`} role="tablist" aria-label={t("accessibility.postStatus")}>
      {tabs.map((tab) => (
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
          {t(`statuses.${tab}`)}
          <span className={`rounded-full px-2 py-0.5 text-xs ${activeTab === tab ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600"}`}>
            {numberFormatter.format(tabCounts[tab])}
          </span>
        </button>
      ))}
    </div>
  );

  const renderAiTools = () => (
    <section className="rounded-2xl border border-violet-200 bg-white p-4 shadow-xs" aria-label={t("accessibility.toolkit")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
            <WandSparkles className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900">{t("ai.toolkit")}</h3>
            <p className="mt-0.5 text-xs leading-5 text-slate-500">{t("ai.description")}</p>
          </div>
        </div>
        {aiLoadingAction ? <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-violet-600"><RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> {t("ai.generating")}</span> : null}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button type="button" disabled={Boolean(aiLoadingAction)} onClick={() => runAiAction("rephrase", activeTone)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50/40 px-3 text-sm font-bold text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-50">
          <Sparkles className="h-4 w-4" aria-hidden="true" /> {t("ai.actions.rephrase")}
        </button>
        <button type="button" disabled={Boolean(aiLoadingAction)} onClick={() => runAiAction("summarize")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50/40 px-3 text-sm font-bold text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-50">
          <FileText className="h-4 w-4" aria-hidden="true" /> {t("ai.actions.summarize")}
        </button>
        <button type="button" disabled={Boolean(aiLoadingAction)} onClick={() => runAiAction("translate")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50/40 px-3 text-sm font-bold text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-50">
          <Languages className="h-4 w-4" aria-hidden="true" /> {t("ai.actions.translate")}
        </button>
        <button type="button" disabled={Boolean(aiLoadingAction)} onClick={() => runAiAction("hashtags")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50/40 px-3 text-sm font-bold text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-50">
          <Hash className="h-4 w-4" aria-hidden="true" /> {t("ai.actions.hashtags")}
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-xs font-bold text-slate-600">
          {t("ai.tone")}
          <select value={activeTone} onChange={(event) => setActiveTone(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-800 xl:text-sm">
            {toneOptions.map((tone) => <option key={tone.value} value={tone.value}>{t(tone.labelKey)}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-600">
          {t("ai.language")}
          <select value={activeLanguage} onChange={(event) => setActiveLanguage(event.target.value as AIOutputLanguageId)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-800 xl:text-sm">
            {AI_OUTPUT_LANGUAGE_IDS.map((languageId) => <option key={languageId} value={languageId}>{t(`common:aiLanguages.${languageId}`)}</option>)}
          </select>
        </label>
      </div>
    </section>
  );

  const renderEditor = (showPreview = true) => {
    if (!selectedPost) return null;
    return (
      <section className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-sky-600">{t("editor.title")}</p>
              <p className="mt-1 text-sm font-semibold text-slate-500">{selectedPost.status === "approved" ? t("statuses.approved") : t("statuses.pending")}</p>
            </div>
            <span className={`rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold ${draftText.length > 4096 ? "text-rose-600" : "text-slate-500"}`}>{numberFormatter.format(draftText.length)} / {numberFormatter.format(4096)}</span>
          </div>
          <textarea
            aria-label={t("accessibility.curatedVersion")}
            value={draftText}
            onChange={(event) => setDraftText(event.target.value)}
            rows={8}
            dir="auto"
            className="mt-2 w-full resize-y rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base leading-7 text-slate-900 outline-hidden transition-shadow focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
          />
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500">{isDirty ? t("editor.unsaved") : t("editor.saved")}</p>
            <button type="button" onClick={copyDraft} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-slate-600 hover:bg-slate-100">
              {copied ? <Check className="h-4 w-4 text-emerald-500" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              {copied ? t("editor.copied") : t("editor.copy")}
            </button>
          </div>
        </div>
        {renderAiTools()}
        {aiSuggestion ? <AiSuggestionCard suggestion={aiSuggestion} onApply={applySuggestion} onDismiss={() => setAiSuggestion(null)} /> : null}
        {showPreview ? (
          <details className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <span className="text-sm font-bold text-slate-800">{t("preview.title")}</span>
              <ChevronDown className="h-5 w-5 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="mt-4 border-t border-slate-100 pt-4">
              <TelegramPreview post={selectedPost} text={draftText} />
            </div>
          </details>
        ) : null}
        {feedback ? (
          <div className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${feedback.type === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`} role={feedback.type === "error" ? "alert" : "status"}>
            {feedback.type === "error" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
            <span>{feedback.messageKey ? t(feedback.messageKey) : feedback.message}</span>
          </div>
        ) : null}
      </section>
    );
  };

  const renderHistoryDetails = () => {
    if (!selectedPost) return null;
    const publishedDate = selectedPost.postedAt
      ? formatDate(selectedPost.postedAt, locale)
      : null;

    return (
      <section className="space-y-4" aria-label={th("accessibility.publishedEditor")}>
        <div>
          <h2 className="font-display text-lg font-bold text-slate-950">{th("details.publishedVersion")}</h2>
          <p className="mt-2 whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base leading-7 text-slate-800" dir="auto">
            {selectedPost.text || t("preview.empty")}
          </p>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-bold text-slate-800">{t("preview.title")}</h3>
          <TelegramPreview post={selectedPost} text={selectedPost.text} />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{th("details.deliveryStatus")}</p>
          <div className="mt-2 flex items-start gap-2">
            {selectedPost.errorMessage ? (
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900">
                {selectedPost.errorMessage ? th("details.deliveredWithWarnings") : th("details.delivered")}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {publishedDate ? th("details.publishedAt", { date: publishedDate }) : th("details.noTimestamp")}
              </p>
            </div>
          </div>
          {selectedPost.errorMessage ? (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-700">{th("details.deliveryNote")}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600" dir="auto">{selectedPost.errorMessage}</p>
            </div>
          ) : null}
        </div>
      </section>
    );
  };

  const renderDestinationSummary = () => (
    <div className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-start">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><Send className="h-4 w-4 -rotate-12" aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-slate-900">{t("destinations.selected", { count: enabledTargets.length, formattedCount: numberFormatter.format(enabledTargets.length) })}</span>
        <span className="block truncate text-xs text-slate-500">{enabledTargets.length > 0 ? enabledTargets.map((target) => target.name).join(", ") : t("destinations.noneEnabled")}</span>
      </span>
      <ChevronRight className="rtl-mirror h-5 w-5 text-slate-400" aria-hidden="true" />
    </div>
  );

  const renderActions = (mobile = false) => {
    if (!selectedPost) return null;
    const publishing = publishingId === selectedPost.id;
    return (
      <div className={mobile ? "grid grid-cols-3 gap-2" : "grid grid-cols-1 gap-2 sm:grid-cols-3"}>
        <button type="button" onClick={saveDraft} disabled={!isDirty} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-white px-4 text-sm font-bold text-sky-700 hover:bg-sky-50 disabled:border-slate-200 disabled:text-slate-400">
          <FileText className="h-4 w-4" aria-hidden="true" /> <span className={mobile ? "hidden min-[370px]:inline" : ""}>{t("editor.saveDraft")}</span>
        </button>
        <button type="button" onClick={approvePost} disabled={selectedPost.status === "posted"} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-emerald-600 bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:border-slate-300 disabled:bg-slate-300">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {t("actions.approve")}
        </button>
        <button type="button" onClick={publishPost} disabled={publishing || selectedPost.status !== "approved"} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 text-sm font-bold text-white shadow-sm hover:bg-sky-700 disabled:bg-slate-300">
          {publishing ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4 -rotate-12" aria-hidden="true" />}
          {publishing ? t("actions.publishing") : t("actions.publish")}
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          {isHistory ? (
            <div>
              <h2 className="font-display text-lg font-bold text-slate-950">{th("header.title")}</h2>
              <p className="mt-1 text-sm text-slate-500">{th("header.description")}</p>
            </div>
          ) : (
            <>
              <div className="hidden xl:block">{renderStatusTabs()}</div>
              <div className="xl:hidden">{renderStatusTabs(true)}</div>
            </>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative block min-w-0 sm:w-80">
              <span className="sr-only">{isHistory ? th("search.label") : t("search.label")}</span>
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={isHistory ? th("search.placeholder") : t("search.placeholder")} className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 ps-10 pe-4 text-base outline-hidden focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100 xl:text-sm" />
            </label>
            {!isHistory ? (
              <button type="button" onClick={onTriggerScrape} disabled={isScraping} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 text-sm font-bold text-sky-700 hover:bg-sky-100 disabled:opacity-50">
                <RefreshCw className={`h-4 w-4 ${isScraping ? "animate-spin" : ""}`} aria-hidden="true" />
                {isScraping ? t("actions.syncing") : t("actions.sync")}
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {filteredPosts.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-16 text-center shadow-xs">
          <Inbox className="mx-auto h-12 w-12 text-slate-300" aria-hidden="true" />
          <h2 className="mt-4 font-display text-lg font-bold text-slate-800">
            {isHistory ? th("empty.title") : t("empty.title", { status: t(`statuses.${activeTab}`) })}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
            {isHistory ? (searchQuery ? th("empty.search") : th("empty.description")) : (searchQuery ? t("empty.search") : t("empty.default"))}
          </p>
          {!isHistory && !searchQuery && activeTab === "pending" ? (
            <button type="button" onClick={onTriggerScrape} disabled={isScraping} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-600 px-5 text-sm font-bold text-white hover:bg-sky-700">
              <RefreshCw className={`h-4 w-4 ${isScraping ? "animate-spin" : ""}`} aria-hidden="true" /> {t("actions.sync")}
            </button>
          ) : null}
        </section>
      ) : isDesktopWorkspace ? (
          <section className="grid h-[calc(100dvh-10.5rem)] min-h-[660px] grid-cols-[320px_minmax(0,0.88fr)_minmax(460px,1.12fr)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <aside className="flex min-h-0 flex-col border-e border-slate-200 bg-slate-50/40" aria-label={isHistory ? th("accessibility.historyList") : t("accessibility.postQueue")}>
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-950">{isHistory ? th("queue.title") : t("queue.title")}</h2>
                  <p className="text-xs text-slate-500">
                    {isHistory
                      ? th("queue.count", { count: filteredPosts.length, formattedCount: numberFormatter.format(filteredPosts.length) })
                      : t("queue.count", { count: filteredPosts.length, formattedCount: numberFormatter.format(filteredPosts.length), status: t(`statuses.${activeTab}`) })}
                  </p>
                </div>
              </div>
              <div className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
                {filteredPosts.map((post) => (
                  <button type="button" key={post.id} onClick={() => selectPost(post)} aria-current={selectedPost?.id === post.id ? "true" : undefined} className={`content-visibility-auto flex w-full gap-3 px-4 py-4 text-start transition-colors ${selectedPost?.id === post.id ? "bg-sky-50 ring-1 ring-inset ring-sky-200" : "bg-white/70 hover:bg-white"}`}>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">{getInitials(post.channelUsername, "TG")}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-bold text-sky-700">@{post.channelUsername}</span><span className="shrink-0 text-xs text-slate-400">{formatDate(isHistory && post.postedAt ? post.postedAt : post.date, locale)}</span></span>
                      <span className="mt-1 line-clamp-2 text-sm leading-5 text-slate-600" dir="auto">{post.originalText || t("queue.mediaPost")}</span>
                      <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-xs font-bold ${statusClasses(post.status)}`}>{t(`statuses.${post.status}`)}</span>
                    </span>
                    {post.photoUrl ? <img src={post.photoUrl} alt="" onError={(event) => { event.currentTarget.hidden = true; }} className="h-12 w-12 shrink-0 rounded-lg bg-slate-100 object-cover" /> : null}
                  </button>
                ))}
              </div>
            </aside>

            {selectedPost ? <OriginalPostPanel post={selectedPost} /> : null}

            {selectedPost ? (
              <section className="flex min-h-0 flex-col border-s border-slate-200 bg-slate-100/60" aria-label={isHistory ? th("accessibility.publishedEditor") : t("accessibility.curatedEditor")}>
                <div className="min-h-0 flex-1 overflow-y-auto p-5">{isHistory ? renderHistoryDetails() : renderEditor()}</div>
                {!isHistory ? (
                  <div className="border-t border-slate-200 bg-white p-4 shadow-[0_-8px_24px_rgba(15,23,42,0.04)]">
                    <div className="mb-3 flex min-w-0 items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                        <Send className="h-4 w-4 -rotate-12" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900">{t("destinations.publishingTo", { count: enabledTargets.length, formattedCount: numberFormatter.format(enabledTargets.length) })}</p>
                        <p className="truncate text-xs text-slate-500" title={enabledTargets.length ? enabledTargets.map((target) => target.name).join(", ") : undefined}>{enabledTargets.length ? enabledTargets.map((target) => target.name).join(", ") : t("destinations.configureToPublish")}</p>
                      </div>
                      <button type="button" onClick={archivePost} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-bold text-slate-500 hover:bg-white hover:text-rose-600"><Archive className="h-4 w-4" aria-hidden="true" /> {selectedPost.status === "archived" ? t("actions.restore") : t("actions.archive")}</button>
                    </div>
                    {renderActions()}
                  </div>
                ) : null}
              </section>
            ) : null}
          </section>
      ) : (
          <section className="space-y-3" aria-label={t("accessibility.mobilePostList")}>
            {filteredPosts.map((post) => (
              <button type="button" key={post.id} onClick={() => selectPost(post, true)} className={`content-visibility-auto flex w-full gap-3 rounded-2xl border bg-white p-4 text-start shadow-xs transition-colors ${post.errorMessage ? "border-rose-200" : "border-slate-200 hover:border-sky-300"}`}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">{getInitials(post.channelUsername, "TG")}</span>
                <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-base font-bold text-slate-900">@{post.channelUsername}</span><span className="shrink-0 text-sm text-slate-400">{formatDate(isHistory && post.postedAt ? post.postedAt : post.date, locale)}</span></span><span className="mt-2 line-clamp-3 text-[15px] leading-6 text-slate-600" dir="auto">{post.originalText || t("queue.mediaPost")}</span><span className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusClasses(post.status)}`}>{t(`statuses.${post.status}`)}</span></span>
                {post.photoUrl ? <img src={post.photoUrl} alt="" onError={(event) => { event.currentTarget.hidden = true; }} className="h-20 w-20 shrink-0 rounded-xl bg-slate-100 object-cover" /> : <ChevronRight className="rtl-mirror mt-2 h-5 w-5 shrink-0 text-slate-300" aria-hidden="true" />}
              </button>
            ))}
          </section>
      )}

      {mobileReviewOpen && selectedPost ? (
        <div role="dialog" aria-modal="true" aria-label={t("accessibility.reviewPost")} className="fixed inset-0 z-[80] flex flex-col bg-slate-50 xl:hidden">
          <header className="flex min-h-16 items-center justify-between border-b border-slate-200 bg-white px-3 pt-[env(safe-area-inset-top)]">
            <button type="button" autoFocus onClick={() => setMobileReviewOpen(false)} aria-label={t("mobile.back")} className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100"><ArrowLeft className="rtl-mirror h-5 w-5" aria-hidden="true" /></button>
            <div className="text-center"><h1 className="font-display text-lg font-bold text-slate-950">{isHistory ? th("mobile.title") : t("mobile.reviewPost")}</h1><p className="text-xs font-semibold text-slate-500">{t("mobile.position", { current: numberFormatter.format(filteredPosts.findIndex((post) => post.id === selectedPost.id) + 1), total: numberFormatter.format(filteredPosts.length) })}</p></div>
            <span className="h-11 w-11" aria-hidden="true" />
          </header>

          <div className="border-b border-slate-200 bg-white px-4 py-3">
            {!isHistory ? (
              <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 text-center">
                <div><span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-sky-600 text-sm font-bold text-white">1</span><p className="mt-1 text-xs font-bold text-sky-600">{t("mobile.steps.review")}</p></div><div className="h-px w-full bg-slate-200" /><div><span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500">2</span><p className="mt-1 text-xs font-semibold text-slate-500">{t("mobile.steps.approve")}</p></div><div className="h-px w-full bg-slate-200" /><div><span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500">3</span><p className="mt-1 text-xs font-semibold text-slate-500">{t("mobile.steps.publish")}</p></div>
              </div>
            ) : null}
            <div className={`${isHistory ? "" : "mt-3"} grid grid-cols-3 rounded-xl border border-slate-200 bg-slate-50 p-1`} role="tablist" aria-label={isHistory ? th("mobile.modeLabel") : t("mobile.modeLabel")}>
              {(["original", "edit", "preview"] as MobileReviewView[]).map((view) => <button type="button" key={view} role="tab" aria-selected={mobileReviewView === view} onClick={() => setMobileReviewView(view)} className={`min-h-11 rounded-lg text-sm font-bold capitalize ${mobileReviewView === view ? "bg-white text-sky-700 shadow-xs" : "text-slate-500"}`}>{isHistory ? th(`mobile.modes.${view}`) : t(`mobile.modes.${view}`)}</button>)}
            </div>
          </div>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-8">
            <div className="mx-auto max-w-2xl space-y-4">
              <section className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">{getInitials(selectedPost.channelUsername, "TG")}</span><div className="min-w-0 flex-1"><p className="truncate text-base font-bold text-slate-900">@{selectedPost.channelUsername}</p><p className="text-sm text-slate-500">{formatDate(selectedPost.date, locale)}</p></div><a href={selectedPost.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-bold text-sky-600">{t("original.openOriginal")} <ExternalLink className="h-4 w-4" aria-hidden="true" /></a>
              </section>

              {mobileReviewView === "original" ? <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><OriginalPostPanel post={selectedPost} /></div> : null}
              {mobileReviewView === "edit" ? (
                isHistory ? renderHistoryDetails() : (
                  <>
                    <details className="group rounded-2xl border border-slate-200 bg-white p-4"><summary className="flex cursor-pointer list-none items-center gap-3"><FileText className="h-5 w-5 text-slate-600" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900">{t("original.summary")}</span><span className="block text-xs text-slate-500">{t("original.characters", { count: selectedPost.originalText.length, formattedCount: numberFormatter.format(selectedPost.originalText.length) })}{selectedPost.photoUrl || selectedPost.videoUrl ? ` · ${t("original.mediaAttached")}` : ""}</span></span><ChevronDown className="h-5 w-5 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" /></summary><p className="mt-4 whitespace-pre-wrap border-t border-slate-100 pt-4 text-[15px] leading-7 text-slate-600" dir="auto">{selectedPost.originalText}</p></details>
                    {renderEditor(false)}
                    {renderDestinationSummary()}
                  </>
                )
              ) : null}
              {mobileReviewView === "preview" ? <div className="space-y-4"><div><h2 className="mb-2 font-display text-lg font-bold text-slate-950">{t("preview.title")}</h2><TelegramPreview post={selectedPost} text={isHistory ? selectedPost.text : draftText} /></div>{!isHistory ? renderDestinationSummary() : null}{feedback && !isHistory ? <div className={`rounded-xl border p-3 text-sm ${feedback.type === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{feedback.messageKey ? t(feedback.messageKey) : feedback.message}</div> : null}</div> : null}
            </div>
          </main>

          {!isHistory ? <footer className="border-t border-slate-200 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)]"><div className="mx-auto max-w-2xl">{renderActions(true)}</div></footer> : null}
        </div>
      ) : null}
    </div>
  );
}
