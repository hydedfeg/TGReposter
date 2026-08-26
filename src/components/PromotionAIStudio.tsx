import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BrainCircuit,
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import type {
  PromotionCampaign,
  PromotionCampaignPost,
  PromotionContentMode,
} from "../types";
import { safeResponseJson } from "../utils/api";

type PromotionAIAction = "teaser" | "rewrite" | "shorten" | "expand" | "translate" | "cta" | "hashtags";
type PromotionAIStyle = "professional" | "news" | "educational" | "friendly" | "casual" | "marketing" | "viral";
type UserRole = "super-admin" | "admin" | null;

interface StudioCampaignPost extends PromotionCampaignPost {
  sourcePost?: {
    id: string;
    channelUsername: string;
    originalText: string;
    editedText?: string;
    telegramUrl?: string;
    status: string;
  } | null;
}

interface CampaignDetail {
  campaign: PromotionCampaign;
  posts: StudioCampaignPost[];
}

interface PromotionAIStudioProps {
  currentUserRole: UserRole;
  onToast: (message: string, type?: "success" | "error") => void;
}

const actions: Array<{ value: PromotionAIAction; label: string; help: string }> = [
  { value: "teaser", label: "Teaser", help: "Create a concise curiosity-building introduction without clickbait." },
  { value: "rewrite", label: "Promotional rewrite", help: "Turn the source or current draft into polished promotional copy." },
  { value: "shorten", label: "Shorten", help: "Compress the working copy while preserving essential facts." },
  { value: "expand", label: "Expand", help: "Improve structure and explanation without inventing new facts." },
  { value: "translate", label: "Translate", help: "Translate faithfully while preserving links, names, and formatting." },
  { value: "cta", label: "Generate CTA", help: "Generate one short call-to-action for the campaign post." },
  { value: "hashtags", label: "Generate hashtags", help: "Create 3-6 relevant Telegram hashtags." },
];

const styles: PromotionAIStyle[] = [
  "professional",
  "news",
  "educational",
  "friendly",
  "casual",
  "marketing",
  "viral",
];

const modeLabels: Record<PromotionContentMode, string> = {
  original: "Original",
  teaser: "Teaser",
  ai: "AI prepared",
  custom: "Custom",
};

function previewText(post: StudioCampaignPost | null, mode: PromotionContentMode, draft: string, cta: string) {
  if (!post) return "";
  const sourceText = post.sourcePost?.originalText?.trim() || "";
  const base = mode === "original" ? sourceText : draft.trim();
  const sourceLink = post.sourceLinkOverride?.trim() || post.sourcePost?.telegramUrl?.trim() || "";
  const parts = [base, cta.trim()].filter(Boolean);
  if (sourceLink && !parts.some(part => part.includes(sourceLink))) parts.push(sourceLink);
  return parts.join("\n\n").trim();
}

export default function PromotionAIStudio({ currentUserRole, onToast }: PromotionAIStudioProps) {
  const [campaigns, setCampaigns] = useState<PromotionCampaign[]>([]);
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [campaignId, setCampaignId] = useState("");
  const [campaignPostId, setCampaignPostId] = useState("");
  const [action, setAction] = useState<PromotionAIAction>("rewrite");
  const [style, setStyle] = useState<PromotionAIStyle>("professional");
  const [language, setLanguage] = useState("English");
  const [instructions, setInstructions] = useState("");
  const [draftText, setDraftText] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [saveMode, setSaveMode] = useState<PromotionContentMode>("ai");
  const [generatedResult, setGeneratedResult] = useState("");
  const [providerInfo, setProviderInfo] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem("curator_token");
    return fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  };

  const requestJson = async (url: string, options: RequestInit = {}) => {
    const response = await authFetch(url, options);
    const data = await safeResponseJson(response);
    if (!response.ok) throw new Error(data?.error || `Promotion AI request failed (${response.status}).`);
    return data;
  };

  const loadCampaigns = async () => {
    const data = await requestJson("/api/promotion/campaigns");
    const next = (data.campaigns || []) as PromotionCampaign[];
    setCampaigns(next);
    if (!campaignId) {
      const editable = next.find(item => item.status === "draft" || item.status === "ready");
      if (editable) setCampaignId(editable.id);
    }
    return next;
  };

  const loadDetail = async (id: string) => {
    if (!id) {
      setDetail(null);
      return;
    }
    const data = await requestJson(`/api/promotion/campaigns/${id}`);
    setDetail(data);
    const posts = (data.posts || []) as StudioCampaignPost[];
    if (!posts.some(post => post.id === campaignPostId)) {
      setCampaignPostId(posts[0]?.id || "");
    }
  };

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      await loadCampaigns();
      if (campaignId) await loadDetail(campaignId);
    } catch (err: any) {
      setError(err.message || "Unable to load Promotion AI Studio.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!campaignId) return;
    setGeneratedResult("");
    setProviderInfo("");
    setBusy(true);
    loadDetail(campaignId)
      .catch((err: any) => setError(err.message || "Unable to load campaign."))
      .finally(() => setBusy(false));
  }, [campaignId]);

  const selectedPost = useMemo(
    () => detail?.posts.find(post => post.id === campaignPostId) || null,
    [detail?.posts, campaignPostId]
  );

  useEffect(() => {
    if (!selectedPost) {
      setDraftText("");
      setCtaText("");
      setGeneratedResult("");
      return;
    }
    setDraftText(selectedPost.promotionText || "");
    setCtaText(selectedPost.ctaText || "");
    setSaveMode(selectedPost.contentMode);
    setGeneratedResult("");
    setProviderInfo("");
  }, [selectedPost?.id]);

  const editableCampaign = detail?.campaign.status === "draft" || detail?.campaign.status === "ready";
  const selectedAction = actions.find(item => item.value === action)!;
  const renderedPreview = previewText(selectedPost, saveMode, draftText, ctaText);

  const generate = async () => {
    if (!detail || !selectedPost) {
      onToast("Select a campaign post first.", "error");
      return;
    }
    if (!editableCampaign) {
      onToast("AI generation is available only for Draft or Ready campaigns.", "error");
      return;
    }
    if (action === "translate" && !language.trim()) {
      onToast("Choose a target language for translation.", "error");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const data = await requestJson(
        `/api/promotion/campaigns/${detail.campaign.id}/posts/${selectedPost.id}/ai`,
        {
          method: "POST",
          body: JSON.stringify({
            action,
            style,
            language: language.trim() || undefined,
            instructions: instructions.trim() || undefined,
            currentText: draftText.trim() || undefined,
          }),
        }
      );
      setGeneratedResult(data.result || "");
      setProviderInfo([data.provider, data.model].filter(Boolean).join(" · "));
      onToast(`${selectedAction.label} generated. Review it before applying.`);
    } catch (err: any) {
      setError(err.message || "AI generation failed.");
      onToast(err.message || "AI generation failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const applyGenerated = () => {
    if (!generatedResult.trim() || !selectedPost) return;
    const result = generatedResult.trim();

    if (action === "cta") {
      setCtaText(result);
    } else if (action === "hashtags") {
      const sourceBase = selectedPost.sourcePost?.editedText?.trim() || selectedPost.sourcePost?.originalText?.trim() || "";
      const base = draftText.trim() || sourceBase;
      setDraftText(base.includes(result) ? base : [base, result].filter(Boolean).join("\n\n"));
      setSaveMode("ai");
    } else {
      setDraftText(result);
      setSaveMode(action === "teaser" ? "teaser" : "ai");
    }
    onToast("Generated result applied to the editable campaign copy.");
  };

  const save = async () => {
    if (!detail || !selectedPost) return;
    if (!editableCampaign) {
      onToast("Only Draft or Ready campaign posts can be edited.", "error");
      return;
    }
    if (saveMode !== "original" && !draftText.trim()) {
      onToast(`${modeLabels[saveMode]} mode requires promotion text.`, "error");
      return;
    }

    setBusy(true);
    try {
      await requestJson(`/api/promotion/campaigns/${detail.campaign.id}/posts/${selectedPost.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          contentMode: saveMode,
          ...(saveMode === "original" ? {} : { promotionText: draftText }),
          ctaText,
        }),
      });
      await loadDetail(detail.campaign.id);
      onToast("AI-assisted promotion copy saved to the campaign.");
    } catch (err: any) {
      onToast(err.message || "Unable to save promotion copy.", "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-3xs">
        <Loader2 className="w-8 h-8 text-violet-500 animate-spin mx-auto" />
        <p className="text-sm font-bold text-slate-800 mt-3">Loading Promotion AI Studio</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden bg-gradient-to-br from-violet-950 via-slate-950 to-slate-900 rounded-2xl border border-violet-900/50 p-6 sm:p-7 text-white shadow-sm">
        <div className="absolute -right-20 -top-24 w-72 h-72 rounded-full bg-violet-500/15 blur-3xl" />
        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
          <div>
            <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-bold text-violet-300 mb-3">
              <BrainCircuit className="w-3.5 h-3.5" /> AI Promotion Engine
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Generate, review, then save</h2>
            <p className="text-sm text-slate-300 mt-2 max-w-2xl leading-relaxed">
              Generate promotion-specific copy with the configured Gemini or OpenRouter model. Results stay editable and are never published automatically.
            </p>
          </div>
          <button onClick={refresh} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-bold">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </section>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex gap-3 text-rose-800">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div><p className="text-sm font-bold">AI operation failed</p><p className="text-xs mt-1">{error}</p></div>
        </div>
      )}

      <div className="grid xl:grid-cols-[0.86fr_1.14fr] gap-5 items-start">
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs">
            <div className="flex items-center gap-2 mb-4"><FileText className="w-4.5 h-4.5 text-violet-500" /><h3 className="text-sm font-bold text-slate-900">Campaign post</h3></div>
            <div className="space-y-3">
              <label className="block">
                <span className="text-[10px] font-bold text-slate-600">Campaign</span>
                <select value={campaignId} onChange={event => setCampaignId(event.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs bg-white">
                  <option value="">Select campaign</option>
                  {campaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name} · {campaign.status}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[10px] font-bold text-slate-600">Post</span>
                <select value={campaignPostId} onChange={event => setCampaignPostId(event.target.value)} disabled={!detail} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs bg-white disabled:bg-slate-50">
                  <option value="">Select campaign post</option>
                  {(detail?.posts || []).map(post => <option key={post.id} value={post.id}>@{post.sourcePost?.channelUsername || "unknown"} — {(post.sourcePost?.originalText || post.postId).slice(0, 90)}</option>)}
                </select>
              </label>
              {detail && (
                <div className={`rounded-xl border p-3 text-xs ${editableCampaign ? "bg-emerald-50 border-emerald-100 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                  <b>{detail.campaign.status}</b> campaign · {editableCampaign ? "AI editing enabled" : "read-only after publishing starts"} · role {currentUserRole || "unknown"}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs">
            <div className="flex items-center gap-2 mb-4"><WandSparkles className="w-4.5 h-4.5 text-violet-500" /><h3 className="text-sm font-bold text-slate-900">Generation controls</h3></div>
            <div className="space-y-3">
              <label className="block"><span className="text-[10px] font-bold text-slate-600">AI action</span><select value={action} onChange={event => setAction(event.target.value as PromotionAIAction)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs bg-white">{actions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select><p className="text-[10px] text-slate-400 mt-1">{selectedAction.help}</p></label>
              <div className="grid sm:grid-cols-2 gap-3">
                <label><span className="text-[10px] font-bold text-slate-600">Writing style</span><select value={style} onChange={event => setStyle(event.target.value as PromotionAIStyle)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs bg-white capitalize">{styles.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
                <label><span className="text-[10px] font-bold text-slate-600">Output language</span><input value={language} onChange={event => setLanguage(event.target.value)} placeholder="English" className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs outline-none focus:border-violet-400" /></label>
              </div>
              <label className="block"><span className="text-[10px] font-bold text-slate-600">Extra instructions <span className="font-normal text-slate-400">optional</span></span><textarea value={instructions} onChange={event => setInstructions(event.target.value)} rows={3} maxLength={600} placeholder="Audience, emphasis, length preference..." className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs resize-y outline-none focus:border-violet-400" /></label>
              <button onClick={generate} disabled={busy || !selectedPost || !editableCampaign} className="w-full inline-flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white rounded-xl px-4 py-3 text-xs font-bold transition-colors">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Generate {selectedAction.label}</button>
              <p className="text-[9px] text-slate-400 leading-relaxed">Provider and API keys are resolved on the backend from the existing AI configuration. Source text is treated as untrusted material, not model instructions.</p>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs">
            <div className="flex items-center justify-between gap-3 mb-4"><div><h3 className="text-sm font-bold text-slate-900">Generated result</h3><p className="text-[10px] text-slate-500 mt-0.5">Review before applying it to campaign copy.</p></div>{providerInfo && <span className="text-[9px] font-mono bg-violet-50 text-violet-700 border border-violet-100 rounded-full px-2.5 py-1">{providerInfo}</span>}</div>
            <textarea value={generatedResult} onChange={event => setGeneratedResult(event.target.value)} rows={8} placeholder="AI output will appear here..." className="w-full border border-slate-200 rounded-xl px-3.5 py-3 text-xs leading-relaxed resize-y outline-none focus:border-violet-400" />
            <button onClick={applyGenerated} disabled={!generatedResult.trim()} className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-50 border border-violet-200 text-violet-700 disabled:text-slate-300 disabled:border-slate-200 disabled:bg-slate-50 text-xs font-bold"><CheckCircle2 className="w-4 h-4" />Apply result to editor</button>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs">
            <div className="flex items-center justify-between gap-3 mb-4"><div><h3 className="text-sm font-bold text-slate-900">Campaign copy editor</h3><p className="text-[10px] text-slate-500 mt-0.5">This is what will be saved for later Telegram publishing.</p></div></div>
            <div className="space-y-3">
              <label className="block"><span className="text-[10px] font-bold text-slate-600">Content mode</span><select value={saveMode} onChange={event => setSaveMode(event.target.value as PromotionContentMode)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs bg-white">{Object.entries(modeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              {saveMode !== "original" && <label className="block"><span className="text-[10px] font-bold text-slate-600">Promotion text</span><textarea value={draftText} onChange={event => setDraftText(event.target.value)} rows={8} className="mt-1 w-full border border-slate-200 rounded-xl px-3.5 py-3 text-xs leading-relaxed resize-y outline-none focus:border-sky-400" /></label>}
              <label className="block"><span className="text-[10px] font-bold text-slate-600">Call to action</span><input value={ctaText} onChange={event => setCtaText(event.target.value)} placeholder="Read more / Join the channel..." className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs outline-none focus:border-sky-400" /></label>
              <button onClick={save} disabled={busy || !selectedPost || !editableCampaign} className="inline-flex items-center gap-2 bg-slate-900 disabled:bg-slate-300 text-white rounded-xl px-5 py-3 text-xs font-bold"><Save className="w-4 h-4" />Save to campaign</button>
            </div>
          </div>

          <div className="rounded-2xl bg-sky-50/60 border border-sky-100 p-5">
            <p className="text-[9px] uppercase tracking-widest font-bold text-sky-500 mb-2">Telegram preview</p>
            <p className={`text-xs whitespace-pre-wrap leading-relaxed ${renderedPreview ? "text-slate-700" : "text-slate-400"}`}>{renderedPreview || "Select a campaign post to preview the final promotion copy."}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
