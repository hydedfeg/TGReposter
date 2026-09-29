import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Clock3,
  Edit3,
  ExternalLink,
  FileText,
  History,
  Loader2,
  Megaphone,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  Send,
  ShieldCheck,
  Target,
  Trash2,
  XCircle,
} from "lucide-react";
import type {
  CuratedPost,
  PromotionCampaign,
  PromotionCampaignPost,
  PromotionContentMode,
  PromotionDelivery,
  PromotionDeliveryAttempt,
  PromotionTarget,
} from "../types";
import { normalizeAppLocale } from "../i18n";
import { safeResponseJson } from "../utils/api";

type UserRole = "super-admin" | "admin" | null;
type PromotionSection = "overview" | "campaigns" | "create" | "targets" | "history";

interface PromotionBotAccount {
  id: string;
  name: string;
  botUsername?: string;
  enabled: boolean;
  credentialConfigured?: boolean;
}

interface PromotionApiTarget extends PromotionTarget {
  botAccount?: {
    id: string;
    name: string;
    botUsername?: string;
    enabled: boolean;
  };
}

interface CampaignDetailPost extends PromotionCampaignPost {
  sourcePost?: {
    id: string;
    channelUsername: string;
    originalText: string;
    editedText?: string;
    photoUrl?: string;
    videoUrl?: string;
    telegramUrl?: string;
    status: string;
    publishedAt?: string;
  } | null;
}

interface DeliverySummary {
  total: number;
  pending: number;
  inProgress: number;
  succeeded: number;
  failed: number;
  skipped: number;
  warnings: number;
}

interface CampaignDetail {
  campaign: PromotionCampaign;
  posts: CampaignDetailPost[];
  deliveries: PromotionDelivery[];
  attempts: PromotionDeliveryAttempt[];
  summary: DeliverySummary;
  resumed?: boolean;
}

interface PromotionWorkspaceProps {
  posts: CuratedPost[];
  currentUserRole: UserRole;
  onToast: (message: string, type?: "success" | "error") => void;
}

const emptySummary: DeliverySummary = {
  total: 0,
  pending: 0,
  inProgress: 0,
  succeeded: 0,
  failed: 0,
  skipped: 0,
  warnings: 0,
};

const contentModeKeys: Record<PromotionContentMode, string> = {
  original: "common.contentMode.original",
  teaser: "common.contentMode.teaser",
  ai: "common.contentMode.ai",
  custom: "common.contentMode.custom",
};

const statusClasses: Record<PromotionCampaign["status"], string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  ready: "bg-sky-50 text-sky-700 border-sky-200",
  running: "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  partial: "bg-orange-50 text-orange-700 border-orange-200",
  failed: "bg-rose-50 text-rose-700 border-rose-200",
  cancelled: "bg-slate-100 text-slate-500 border-slate-200",
};

function campaignDate(value: string | undefined, locale: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(`${locale}-u-ca-gregory`, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function deliveryStatusIcon(status: PromotionDelivery["status"]) {
  if (status === "success") return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  if (status === "failed") return <XCircle className="w-4 h-4 text-rose-500" />;
  if (status === "in_progress") return <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />;
  return <CircleDashed className="w-4 h-4 text-slate-400" />;
}

function getRenderedPreview(campaignPost: CampaignDetailPost) {
  const source = campaignPost.sourcePost;
  const base = campaignPost.contentMode === "original"
    ? source?.originalText?.trim() || ""
    : campaignPost.promotionText?.trim() || "";
  const cta = campaignPost.ctaText?.trim() || "";
  const link = campaignPost.sourceLinkOverride?.trim() || source?.telegramUrl?.trim() || "";
  const parts = [base, cta].filter(Boolean);
  if (link && !parts.some(part => part.includes(link))) parts.push(link);
  return parts.join("\n\n").trim();
}

export default function PromotionWorkspace({ posts, currentUserRole, onToast }: PromotionWorkspaceProps) {
  const { t, i18n } = useTranslation("promotion");
  const locale = normalizeAppLocale(i18n.language);
  const numberFormatter = new Intl.NumberFormat(locale);
  const [section, setSection] = useState<PromotionSection>("overview");
  const [campaigns, setCampaigns] = useState<PromotionCampaign[]>([]);
  const [targets, setTargets] = useState<PromotionApiTarget[]>([]);
  const [botAccounts, setBotAccounts] = useState<PromotionBotAccount[]>([]);
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [localError, setLocalError] = useState("");

  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [postSearch, setPostSearch] = useState("");
  const [selectedPostId, setSelectedPostId] = useState("");
  const [selectedContentMode, setSelectedContentMode] = useState<PromotionContentMode>("original");
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const [launchArmed, setLaunchArmed] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<PromotionContentMode>("original");
  const [editPromotionText, setEditPromotionText] = useState("");
  const [editCtaText, setEditCtaText] = useState("");
  const [editSourceLink, setEditSourceLink] = useState("");
  const [selectedFailedDeliveryIds, setSelectedFailedDeliveryIds] = useState<string[]>([]);
  const [targetName, setTargetName] = useState("");
  const [targetChatId, setTargetChatId] = useState("");
  const [targetChatType, setTargetChatType] = useState<"channel" | "group" | "supergroup">("channel");
  const [targetBotAccountId, setTargetBotAccountId] = useState("");

  const requestToken = useRef(localStorage.getItem("curator_token")).current;
  const requestsActive = useRef(true);
  useEffect(() => {
    requestsActive.current = true;
    return () => { requestsActive.current = false; };
  }, []);
  const requireCurrentSession = () => {
    if (!requestsActive.current || localStorage.getItem("curator_token") !== requestToken) {
      throw new Error(t("workspace.feedback.sessionChanged"));
    }
  };

  const authFetch = async (url: string, options: RequestInit = {}) => {
    requireCurrentSession();
    const token = requestToken;
    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    return fetch(url, { ...options, headers });
  };

  const requestJson = async (url: string, options: RequestInit = {}) => {
    const response = await authFetch(url, options);
    const data = await safeResponseJson(response);
    requireCurrentSession();
    if (!response.ok) {
      const message = data?.error || t("workspace.feedback.requestFailed", { status: response.status });
      throw new Error(message);
    }
    return data;
  };

  const loadCampaignsAndTargets = async () => {
    const requests: Promise<any>[] = [
      requestJson("/api/promotion/campaigns"),
      requestJson("/api/promotion/targets"),
      requestJson("/api/promotion/bot-accounts"),
    ];

    const [campaignData, targetData, botData] = await Promise.all(requests);
    const nextCampaigns = campaignData.campaigns || [];
    const nextTargets = targetData.targets || [];
    const nextBotAccounts = botData?.botAccounts || [];

    setCampaigns(nextCampaigns);
    setTargets(nextTargets);
    setBotAccounts(nextBotAccounts);
    setTargetBotAccountId(current =>
      current && nextBotAccounts.some((account: PromotionBotAccount) => account.id === current)
        ? current
        : nextBotAccounts.find((account: PromotionBotAccount) => account.enabled)?.id || ""
    );
    return { campaigns: nextCampaigns, targets: nextTargets, botAccounts: nextBotAccounts };
  };

  const loadCampaignDetail = async (campaignId: string) => {
    const data = await requestJson(`/api/promotion/campaigns/${campaignId}`);
    setDetail(data);
    setSelectedCampaignId(campaignId);
    setSelectedFailedDeliveryIds([]);
    setLaunchArmed(false);
    return data as CampaignDetail;
  };

  const refreshWorkspace = async (showSuccess = false) => {
    setIsLoading(true);
    setLocalError("");
    try {
      await loadCampaignsAndTargets();
      if (selectedCampaignId) await loadCampaignDetail(selectedCampaignId);
      if (showSuccess) onToast(t("workspace.feedback.refreshed"));
    } catch (error: any) {
      setLocalError(error.message || t("workspace.feedback.loadFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshWorkspace();
  }, []);

  const verifiedTargets = useMemo(
    () => targets.filter(target => target.enabled && target.connectionStatus === "ok" && target.botAccount?.enabled !== false),
    [targets]
  );

  const filteredPosts = useMemo(() => {
    const attached = new Set(detail?.posts.map(item => item.postId) || []);
    const needle = postSearch.trim().toLowerCase();
    return posts
      .filter(post => !attached.has(post.id))
      .filter(post => {
        if (!needle) return true;
        return [post.id, post.channelUsername, post.originalText, post.text]
          .some(value => value?.toLowerCase().includes(needle));
      })
      .slice(0, 30);
  }, [posts, detail?.posts, postSearch]);

  const campaignStats = useMemo(() => {
    const completed = campaigns.filter(campaign => campaign.status === "completed").length;
    const attention = campaigns.filter(campaign => campaign.status === "partial" || campaign.status === "failed").length;
    const active = campaigns.filter(campaign => ["draft", "ready", "running"].includes(campaign.status)).length;
    return { total: campaigns.length, completed, attention, active };
  }, [campaigns]);

  const targetMap = useMemo(() => new Map(targets.map(target => [target.id, target])), [targets]);
  const campaignPostMap = useMemo(
    () => new Map((detail?.posts || []).map(post => [post.id, post])),
    [detail?.posts]
  );

  const openCampaign = async (campaignId: string) => {
    setSection("campaigns");
    setIsActionLoading(true);
    setLocalError("");
    try {
      await loadCampaignDetail(campaignId);
    } catch (error: any) {
      setLocalError(error.message || t("workspace.feedback.campaignLoadFailed"));
    } finally {
      setIsActionLoading(false);
    }
  };

  const createCampaign = async () => {
    if (!createName.trim()) {
      onToast(t("workspace.feedback.nameRequired"), "error");
      return;
    }
    setIsActionLoading(true);
    try {
      const data = await requestJson("/api/promotion/campaigns", {
        method: "POST",
        body: JSON.stringify({ name: createName.trim(), description: createDescription.trim() || undefined }),
      });
      setCreateName("");
      setCreateDescription("");
      await loadCampaignsAndTargets();
      await loadCampaignDetail(data.campaign.id);
      setSection("campaigns");
      onToast(t("workspace.feedback.created"));
    } catch (error: any) {
      onToast(error.message || t("workspace.feedback.createFailed"), "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  const updateCampaignStatus = async (status: "draft" | "ready" | "cancelled") => {
    if (!detail) return;
    setIsActionLoading(true);
    try {
      await requestJson(`/api/promotion/campaigns/${detail.campaign.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await Promise.all([loadCampaignDetail(detail.campaign.id), loadCampaignsAndTargets()]);
      onToast(t("workspace.feedback.marked", { status: t(`common.status.${status}`) }));
    } catch (error: any) {
      onToast(error.message || t("workspace.feedback.updateFailed"), "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  const deleteCampaign = async () => {
    if (!detail || !window.confirm(t("workspace.feedback.deleteConfirm", { name: detail.campaign.name }))) return;
    setIsActionLoading(true);
    try {
      await requestJson(`/api/promotion/campaigns/${detail.campaign.id}`, { method: "DELETE" });
      setDetail(null);
      setSelectedCampaignId(null);
      await loadCampaignsAndTargets();
      setSection("overview");
      onToast(t("workspace.feedback.deleted"));
    } catch (error: any) {
      onToast(error.message || t("workspace.feedback.deleteFailed"), "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  const attachPost = async () => {
    if (!detail || !selectedPostId) {
      onToast(t("workspace.feedback.choosePost"), "error");
      return;
    }
    setIsActionLoading(true);
    try {
      await requestJson(`/api/promotion/campaigns/${detail.campaign.id}/posts`, {
        method: "POST",
        body: JSON.stringify({
          postId: selectedPostId,
          contentMode: selectedContentMode,
          position: detail.posts.length,
        }),
      });
      setSelectedPostId("");
      setPostSearch("");
      await loadCampaignDetail(detail.campaign.id);
      onToast(t("workspace.feedback.postAdded"));
    } catch (error: any) {
      onToast(error.message || t("workspace.feedback.attachFailed"), "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  const beginEditPost = (campaignPost: CampaignDetailPost) => {
    setEditingPostId(campaignPost.id);
    setEditMode(campaignPost.contentMode);
    setEditPromotionText(campaignPost.promotionText || "");
    setEditCtaText(campaignPost.ctaText || "");
    setEditSourceLink(campaignPost.sourceLinkOverride || "");
  };

  const saveCampaignPost = async () => {
    if (!detail || !editingPostId) return;
    if (editMode !== "original" && !editPromotionText.trim()) {
      onToast(t("workspace.feedback.modeNeedsText", { mode: t(contentModeKeys[editMode]) }), "error");
      return;
    }
    setIsActionLoading(true);
    try {
      await requestJson(`/api/promotion/campaigns/${detail.campaign.id}/posts/${editingPostId}`, {
        method: "PATCH",
        body: JSON.stringify({
          contentMode: editMode,
          promotionText: editPromotionText,
          ctaText: editCtaText,
          sourceLinkOverride: editSourceLink,
        }),
      });
      setEditingPostId(null);
      await loadCampaignDetail(detail.campaign.id);
      onToast(t("workspace.feedback.copySaved"));
    } catch (error: any) {
      onToast(error.message || t("workspace.feedback.copySaveFailed"), "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  const removeCampaignPost = async (campaignPostId: string) => {
    if (!detail || !window.confirm(t("workspace.feedback.removePostConfirm"))) return;
    setIsActionLoading(true);
    try {
      await requestJson(`/api/promotion/campaigns/${detail.campaign.id}/posts/${campaignPostId}`, {
        method: "DELETE",
      });
      await loadCampaignDetail(detail.campaign.id);
      onToast(t("workspace.feedback.postRemoved"));
    } catch (error: any) {
      onToast(error.message || t("workspace.feedback.removePostFailed"), "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  const registerPersonalDestinationBot = async () => {
    setIsActionLoading(true);
    try {
      await requestJson("/api/promotion/bot-accounts/personal", {
        method: "POST",
      });
      await loadCampaignsAndTargets();
      onToast(t("workspace.feedback.botRegistered"));
    } catch (error: any) {
      onToast(error.message || t("workspace.feedback.botRegisterFailed"), "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  const createPromotionTarget = async () => {
    if (!targetName.trim() || !targetChatId.trim() || !targetBotAccountId) {
      onToast(t("workspace.feedback.targetRequired"), "error");
      return;
    }

    setIsActionLoading(true);
    try {
      await requestJson("/api/promotion/targets", {
        method: "POST",
        body: JSON.stringify({
          name: targetName.trim(),
          chatId: targetChatId.trim(),
          chatType: targetChatType,
          botAccountId: targetBotAccountId,
          enabled: true,
        }),
      });
      setTargetName("");
      setTargetChatId("");
      await loadCampaignsAndTargets();
      onToast(t("workspace.feedback.targetCreated"));
    } catch (error: any) {
      onToast(error.message || t("workspace.feedback.targetCreateFailed"), "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  const testPromotionTarget = async (targetId: string) => {
    setIsActionLoading(true);
    try {
      await requestJson(`/api/promotion/targets/${targetId}/test`, { method: "POST" });
      await loadCampaignsAndTargets();
      onToast(t("workspace.feedback.targetVerified"));
    } catch (error: any) {
      await loadCampaignsAndTargets().catch(() => undefined);
      onToast(error.message || t("workspace.feedback.targetVerificationFailed"), "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  const setPromotionTargetEnabled = async (target: PromotionApiTarget, enabled: boolean) => {
    setIsActionLoading(true);
    try {
      await requestJson(`/api/promotion/targets/${target.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
      await loadCampaignsAndTargets();
      onToast(enabled ? t("workspace.feedback.targetEnabled") : t("workspace.feedback.targetDisabled"));
    } catch (error: any) {
      onToast(error.message || t("workspace.feedback.targetUpdateFailed"), "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  const deletePromotionTarget = async (target: PromotionApiTarget) => {
    if (!window.confirm(t("workspace.feedback.targetDeleteConfirm", { name: target.name }))) return;

    setIsActionLoading(true);
    try {
      await requestJson(`/api/promotion/targets/${target.id}`, { method: "DELETE" });
      setSelectedTargetIds(current => current.filter(id => id !== target.id));
      await loadCampaignsAndTargets();
      onToast(t("workspace.feedback.targetDeleted"));
    } catch (error: any) {
      onToast(error.message || t("workspace.feedback.targetDeleteFailed"), "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  const toggleTarget = (targetId: string) => {
    setSelectedTargetIds(current =>
      current.includes(targetId) ? current.filter(id => id !== targetId) : [...current, targetId]
    );
    setLaunchArmed(false);
  };

  const launchCampaign = async () => {
    if (!detail) return;
    if (selectedTargetIds.length === 0) {
      onToast(t("workspace.feedback.selectTarget"), "error");
      return;
    }
    if (!launchArmed) {
      setLaunchArmed(true);
      return;
    }

    setIsActionLoading(true);
    try {
      const data = await requestJson(`/api/promotion/campaigns/${detail.campaign.id}/launch`, {
        method: "POST",
        body: JSON.stringify({ targetIds: selectedTargetIds }),
      });
      setDetail(data);
      setLaunchArmed(false);
      await loadCampaignsAndTargets();
      onToast(
        data.campaign?.status === "completed"
          ? t("workspace.feedback.delivered")
          : t("workspace.feedback.deliveryResults")
      );
    } catch (error: any) {
      onToast(error.message || t("workspace.feedback.launchFailed"), "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  const retryFailed = async (onlySelected: boolean) => {
    if (!detail) return;
    if (onlySelected && selectedFailedDeliveryIds.length === 0) {
      onToast(t("workspace.feedback.selectFailed"), "error");
      return;
    }
    setIsActionLoading(true);
    try {
      const data = await requestJson(`/api/promotion/campaigns/${detail.campaign.id}/retry`, {
        method: "POST",
        body: JSON.stringify(onlySelected ? { deliveryIds: selectedFailedDeliveryIds } : {}),
      });
      setDetail(data);
      setSelectedFailedDeliveryIds([]);
      await loadCampaignsAndTargets();
      onToast(t("workspace.feedback.retryFinished"));
    } catch (error: any) {
      onToast(error.message || t("workspace.feedback.retryFailed"), "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  const mutableCampaign = !!detail && (detail.campaign.status === "draft" || detail.campaign.status === "ready");
  const launchableCampaign = !!detail && ["draft", "ready", "running"].includes(detail.campaign.status);
  const failedDeliveries = detail?.deliveries.filter(delivery => delivery.status === "failed") || [];

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-12 flex flex-col items-center justify-center text-center shadow-3xs">
        <Loader2 className="w-8 h-8 text-sky-500 animate-spin mb-3" />
        <p className="text-sm font-bold text-slate-800">{t("workspace.loadingTitle")}</p>
        <p className="text-xs text-slate-500 mt-1">{t("workspace.loadingDescription")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden bg-slate-950 rounded-2xl border border-slate-800 shadow-sm p-6 sm:p-7 text-white">
        <div className="absolute -end-20 -top-24 w-64 h-64 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
          <div>
            <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-bold text-sky-300 mb-3">
              <Megaphone className="w-3.5 h-3.5" />
              {t("workspace.heroEyebrow")}
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">{t("workspace.heroTitle")}</h2>
            <p className="text-sm text-slate-300 mt-2 max-w-2xl leading-relaxed">
              {t("workspace.heroDescription")}
            </p>
          </div>
          <button
            onClick={() => refreshWorkspace(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-bold transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            {t("common.refresh")}
          </button>
        </div>
      </section>

      {localError && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex gap-3 text-rose-800">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold">{t("workspace.loadErrorTitle")}</p>
            <p className="text-xs mt-1" dir="auto">{localError}</p>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-2 shadow-3xs flex flex-wrap gap-1">
        {([
          ["overview", BarChart3, "workspace.tabs.overview"],
          ["campaigns", Megaphone, "workspace.tabs.campaigns"],
          ["create", Plus, "workspace.tabs.create"],
          ["targets", Target, "workspace.tabs.targets"],
          ["history", History, "workspace.tabs.history"],
        ] as const).map(([key, Icon, labelKey]) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className={`flex-1 min-w-[135px] inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-bold transition-all ${
              section === key ? "bg-slate-900 text-white shadow-2xs" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Icon className="w-4 h-4" />
            {t(labelKey)}
          </button>
        ))}
      </div>

      {section === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              ["workspace.stats.campaigns", campaignStats.total, Megaphone, "text-sky-600 bg-sky-50"],
              ["workspace.stats.active", campaignStats.active, Rocket, "text-amber-600 bg-amber-50"],
              ["workspace.stats.completed", campaignStats.completed, CheckCircle2, "text-emerald-600 bg-emerald-50"],
              ["workspace.stats.attention", campaignStats.attention, AlertCircle, "text-rose-600 bg-rose-50"],
            ].map(([label, value, Icon, iconClass]) => (
              <div key={String(label)} className="bg-white border border-slate-200 rounded-xl p-4 shadow-3xs">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconClass}`}>
                  <Icon className="w-4.5 h-4.5" />
                </div>
                <p className="text-2xl font-bold text-slate-900 mt-3">{numberFormatter.format(Number(value))}</p>
                <p className="text-[11px] font-semibold text-slate-500 mt-0.5">{t(String(label))}</p>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-[1.35fr_0.65fr] gap-5">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-3xs overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">{t("workspace.recent.title")}</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">{t("workspace.recent.description")}</p>
                </div>
                <button onClick={() => setSection("campaigns")} className="text-xs font-bold text-sky-600 hover:text-sky-700">{t("common.viewAll")}</button>
              </div>
              {campaigns.length === 0 ? (
                <div className="p-10 text-center">
                  <Megaphone className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-sm font-bold text-slate-700 mt-3">{t("workspace.recent.emptyTitle")}</p>
                  <p className="text-xs text-slate-500 mt-1">{t("workspace.recent.emptyDescription")}</p>
                  <button onClick={() => setSection("create")} className="mt-4 inline-flex items-center gap-2 bg-slate-900 text-white rounded-lg px-4 py-2.5 text-xs font-bold">
                    <Plus className="w-4 h-4" /> {t("workspace.recent.create")}
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {campaigns.slice(0, 6).map(campaign => (
                    <button key={campaign.id} onClick={() => openCampaign(campaign.id)} className="w-full px-5 py-3.5 flex items-center gap-4 text-start hover:bg-slate-50 transition-colors">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0"><Megaphone className="w-4 h-4" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-slate-900 truncate" dir="auto">{campaign.name}</p>
                          <span className={`inline-flex border rounded-full px-2 py-0.5 text-[9px] font-bold ${statusClasses[campaign.status]}`}>{t(`common.status.${campaign.status}`)}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">{campaign.createdByUsername ? t("common.createdBy", { date: campaignDate(campaign.createdAt, locale), username: campaign.createdByUsername }) : t("common.created", { date: campaignDate(campaign.createdAt, locale) })}</p>
                      </div>
                      <ChevronRight className="rtl-mirror w-4 h-4 text-slate-300" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-500" />
                <h3 className="text-sm font-bold text-slate-900">{t("workspace.readiness.title")}</h3>
              </div>
              <p className="text-3xl font-bold text-slate-900 mt-5">{numberFormatter.format(verifiedTargets.length)}<span className="text-base text-slate-400 font-semibold"> / {numberFormatter.format(targets.length)}</span></p>
              <p className="text-xs text-slate-500 mt-1">{t("workspace.readiness.summary")}</p>
              <div className="mt-5 space-y-2">
                {targets.slice(0, 5).map(target => {
                  const ready = verifiedTargets.some(item => item.id === target.id);
                  return (
                    <div key={target.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-700 truncate" dir="auto">{target.name}</p>
                        <p className="text-[10px] text-slate-400 truncate font-mono" dir="ltr">{target.chatId}</p>
                      </div>
                      <span className={`text-[9px] font-bold px-2 py-1 rounded-full ${ready ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{ready ? t("workspace.readiness.ready") : t("workspace.readiness.blocked")}</span>
                    </div>
                  );
                })}
                {targets.length === 0 && <p className="text-xs text-slate-500 py-3">{t("workspace.readiness.empty")}</p>}
              </div>
              <button onClick={() => setSection("targets")} className="mt-4 text-xs font-bold text-sky-600">{t("workspace.readiness.review")}</button>
            </div>
          </div>
        </div>
      )}

      {section === "create" && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-3xs max-w-3xl">
          <div className="flex items-start gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center"><Plus className="w-5 h-5" /></div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">{t("workspace.create.title")}</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{t("workspace.create.description")}</p>
            </div>
          </div>
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-bold text-slate-700">{t("workspace.create.name")}</span>
              <input value={createName} dir="auto" onChange={event => setCreateName(event.target.value)} placeholder={t("workspace.create.namePlaceholder")} className="mt-1.5 w-full border border-slate-200 rounded-xl px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-400" />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-700">{t("workspace.create.descriptionLabel")} <span className="font-normal text-slate-400">{t("common.optional")}</span></span>
              <textarea value={createDescription} dir="auto" onChange={event => setCreateDescription(event.target.value)} placeholder={t("workspace.create.descriptionPlaceholder")} rows={4} className="mt-1.5 w-full border border-slate-200 rounded-xl px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-400 resize-y" />
            </label>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 text-xs text-slate-600 leading-relaxed">
              {t("workspace.create.draftNote")}
            </div>
            <button disabled={isActionLoading || !createName.trim()} onClick={createCampaign} className="inline-flex items-center gap-2 bg-slate-900 disabled:bg-slate-300 text-white rounded-xl px-5 py-3 text-xs font-bold transition-colors">
              {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {t("workspace.create.action")}
            </button>
          </div>
        </div>
      )}

      {section === "campaigns" && (
        <div className="grid xl:grid-cols-[320px_minmax(0,1fr)] gap-5 items-start">
          <aside className="bg-white border border-slate-200 rounded-2xl shadow-3xs overflow-hidden xl:sticky xl:top-4">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div><h3 className="text-sm font-bold text-slate-900">{t("workspace.campaigns.title")}</h3><p className="text-[10px] text-slate-500 mt-0.5">{t("common.total", { count: numberFormatter.format(campaigns.length) })}</p></div>
              <button onClick={() => setSection("create")} className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center"><Plus className="w-4 h-4" /></button>
            </div>
            <div className="max-h-[680px] overflow-auto divide-y divide-slate-100">
              {campaigns.map(campaign => (
                <button key={campaign.id} onClick={() => openCampaign(campaign.id)} className={`w-full p-4 text-start transition-colors ${selectedCampaignId === campaign.id ? "bg-sky-50" : "hover:bg-slate-50"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-slate-900 truncate" dir="auto">{campaign.name}</p>
                    <span className={`shrink-0 border rounded-full px-2 py-0.5 text-[8px] font-bold ${statusClasses[campaign.status]}`}>{t(`common.status.${campaign.status}`)}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5">{campaignDate(campaign.createdAt, locale)}</p>
                </button>
              ))}
              {campaigns.length === 0 && <div className="p-6 text-xs text-slate-500 text-center">{t("workspace.campaigns.empty")}</div>}
            </div>
          </aside>

          {!detail ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-3xs">
              <Megaphone className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="text-sm font-bold text-slate-800 mt-3">{t("workspace.campaigns.selectTitle")}</h3>
              <p className="text-xs text-slate-500 mt-1">{t("workspace.campaigns.selectDescription")}</p>
            </div>
          ) : (
            <div className="space-y-5 min-w-0">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xl font-bold text-slate-900 break-words" dir="auto">{detail.campaign.name}</h3>
                      <span className={`border rounded-full px-2.5 py-1 text-[9px] font-bold ${statusClasses[detail.campaign.status]}`}>{t(`common.status.${detail.campaign.status}`)}</span>
                    </div>
                    {detail.campaign.description && <p className="text-xs text-slate-500 mt-2 leading-relaxed max-w-2xl" dir="auto">{detail.campaign.description}</p>}
                    <p className="text-[10px] text-slate-400 mt-2">{detail.campaign.createdByUsername ? t("common.createdBy", { date: campaignDate(detail.campaign.createdAt, locale), username: detail.campaign.createdByUsername }) : t("common.created", { date: campaignDate(detail.campaign.createdAt, locale) })}</p>
                  </div>
                  {mutableCampaign && (
                    <div className="flex flex-wrap gap-2 shrink-0">
                      {detail.campaign.status === "draft" && <button onClick={() => updateCampaignStatus("ready")} className="px-3 py-2 rounded-lg border border-sky-200 bg-sky-50 text-sky-700 text-[10px] font-bold">{t("workspace.campaigns.markReady")}</button>}
                      {detail.campaign.status === "ready" && <button onClick={() => updateCampaignStatus("draft")} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-[10px] font-bold">{t("workspace.campaigns.backDraft")}</button>}
                      <button aria-label={t("workspace.campaigns.deleteAria", { name: detail.campaign.name })} onClick={deleteCampaign} className="w-8 h-8 rounded-lg border border-rose-100 bg-rose-50 text-rose-500 flex items-center justify-center"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </div>

                {detail.summary.total > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5 pt-5 border-t border-slate-100">
                    <div className="rounded-lg bg-slate-50 p-3"><p className="text-lg font-bold text-slate-900">{detail.summary.total}</p><p className="text-[9px] uppercase tracking-wide font-bold text-slate-400">{t("workspace.campaigns.deliveries")}</p></div>
                    <div className="rounded-lg bg-emerald-50 p-3"><p className="text-lg font-bold text-emerald-700">{detail.summary.succeeded}</p><p className="text-[9px] uppercase tracking-wide font-bold text-emerald-500">{t("workspace.campaigns.succeeded")}</p></div>
                    <div className="rounded-lg bg-rose-50 p-3"><p className="text-lg font-bold text-rose-700">{detail.summary.failed}</p><p className="text-[9px] uppercase tracking-wide font-bold text-rose-500">{t("workspace.campaigns.failed")}</p></div>
                    <div className="rounded-lg bg-amber-50 p-3"><p className="text-lg font-bold text-amber-700">{detail.summary.warnings}</p><p className="text-[9px] uppercase tracking-wide font-bold text-amber-500">{t("workspace.campaigns.warnings")}</p></div>
                  </div>
                )}
              </div>

              {mutableCampaign && (
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs">
                  <div className="flex items-center gap-2 mb-4"><FileText className="w-4.5 h-4.5 text-sky-500" /><h4 className="text-sm font-bold text-slate-900">{t("workspace.posts.addTitle")}</h4></div>
                  <div className="relative mb-3">
                    <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input value={postSearch} onChange={event => setPostSearch(event.target.value)} placeholder={t("workspace.posts.searchPlaceholder")} className="w-full border border-slate-200 rounded-xl ps-9 pe-3 py-2.5 text-xs outline-none focus:border-sky-400" />
                  </div>
                  <div className="grid md:grid-cols-[1fr_160px_auto] gap-2">
                    <select value={selectedPostId} onChange={event => setSelectedPostId(event.target.value)} className="border border-slate-200 rounded-xl px-3 py-2.5 text-xs bg-white min-w-0">
                      <option value="">{t("workspace.posts.select", { count: numberFormatter.format(filteredPosts.length) })}</option>
                      {filteredPosts.map(post => <option key={post.id} value={post.id}>@{post.channelUsername} — {post.originalText.slice(0, 85) || post.id}</option>)}
                    </select>
                    <select value={selectedContentMode} onChange={event => setSelectedContentMode(event.target.value as PromotionContentMode)} className="border border-slate-200 rounded-xl px-3 py-2.5 text-xs bg-white">
                      {Object.entries(contentModeKeys).map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}
                    </select>
                    <button onClick={attachPost} disabled={!selectedPostId || isActionLoading} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 disabled:bg-slate-300 text-white text-xs font-bold"><Plus className="w-4 h-4" /> {t("common.add")}</button>
                  </div>
                  {selectedContentMode === "ai" && <p className="text-[10px] text-violet-600 mt-2">{t("workspace.posts.aiNote")}</p>}
                </div>
              )}

              <div className="space-y-3">
                {detail.posts.map((campaignPost, index) => {
                  const preview = getRenderedPreview(campaignPost);
                  const editing = editingPostId === campaignPost.id;
                  return (
                    <div key={campaignPost.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="w-6 h-6 rounded-md bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center">{index + 1}</span>
                            <p className="text-xs font-bold text-slate-800" dir="ltr">@{campaignPost.sourcePost?.channelUsername || t("common.unknownChannel")}</p>
                            <span className="bg-slate-100 text-slate-600 rounded-full px-2 py-0.5 text-[9px] font-bold">{t(contentModeKeys[campaignPost.contentMode])}</span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1.5 font-mono break-all" dir="ltr">{campaignPost.postId}</p>
                        </div>
                        {mutableCampaign && !editing && (
                          <div className="flex gap-1.5">
                            <button aria-label={t("workspace.posts.editAria")} onClick={() => beginEditPost(campaignPost)} className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 flex items-center justify-center hover:bg-slate-50"><Edit3 className="w-3.5 h-3.5" /></button>
                            <button aria-label={t("workspace.posts.removeAria")} onClick={() => removeCampaignPost(campaignPost.id)} className="w-8 h-8 rounded-lg border border-rose-100 text-rose-500 bg-rose-50 flex items-center justify-center"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        )}
                      </div>

                      {editing ? (
                        <div className="mt-4 grid gap-3">
                          <label><span className="text-[10px] font-bold text-slate-600">{t("workspace.posts.contentMode")}</span><select value={editMode} onChange={event => setEditMode(event.target.value as PromotionContentMode)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 text-xs bg-white">{Object.entries(contentModeKeys).map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}</select></label>
                          {editMode !== "original" && (
                            <label><span className="text-[10px] font-bold text-slate-600">{t("workspace.posts.promotionText")}</span><textarea value={editPromotionText} dir="auto" onChange={event => setEditPromotionText(event.target.value)} rows={6} placeholder={editMode === "ai" ? t("workspace.posts.aiPlaceholder") : t("workspace.posts.textPlaceholder")} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 text-xs leading-relaxed resize-y outline-none focus:border-sky-400" /></label>
                          )}
                          <div className="grid sm:grid-cols-2 gap-3">
                            <label><span className="text-[10px] font-bold text-slate-600">{t("workspace.posts.cta")}</span><input value={editCtaText} dir="auto" onChange={event => setEditCtaText(event.target.value)} placeholder={t("workspace.posts.ctaPlaceholder")} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 text-xs outline-none focus:border-sky-400" /></label>
                            <label><span className="text-[10px] font-bold text-slate-600">{t("workspace.posts.sourceLink")}</span><input value={editSourceLink} dir="ltr" onChange={event => setEditSourceLink(event.target.value)} placeholder="https://t.me/..." className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 text-xs outline-none focus:border-sky-400" /></label>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={saveCampaignPost} disabled={isActionLoading} className="inline-flex items-center gap-2 bg-slate-900 text-white rounded-lg px-4 py-2.5 text-xs font-bold"><Check className="w-4 h-4" /> {t("workspace.posts.save")}</button>
                            <button onClick={() => setEditingPostId(null)} className="px-4 py-2.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600">{t("common.cancel")}</button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-4 grid lg:grid-cols-2 gap-4">
                          <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                            <p className="text-[9px] uppercase tracking-widest font-bold text-slate-400 mb-2">{t("workspace.posts.originalTitle")}</p>
                            <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed line-clamp-[12]" dir="auto">{campaignPost.sourcePost?.originalText || t("workspace.posts.sourceUnavailable")}</p>
                          </div>
                          <div className="rounded-xl bg-sky-50/60 border border-sky-100 p-4">
                            <p className="text-[9px] uppercase tracking-widest font-bold text-sky-500 mb-2">{t("workspace.posts.preview")}</p>
                            <p dir="auto" className={`text-xs whitespace-pre-wrap leading-relaxed ${preview ? "text-slate-700" : "text-rose-600"}`}>{preview || t("workspace.posts.copyNotReady")}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {detail.posts.length === 0 && (
                  <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center"><FileText className="w-8 h-8 text-slate-300 mx-auto" /><p className="text-sm font-bold text-slate-700 mt-3">{t("workspace.posts.emptyTitle")}</p><p className="text-xs text-slate-500 mt-1">{t("workspace.posts.emptyDescription")}</p></div>
                )}
              </div>

              {launchableCampaign && (
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><Target className="w-4.5 h-4.5" /></div>
                    <div><h4 className="text-sm font-bold text-slate-900">{t("workspace.launch.title")}</h4><p className="text-[11px] text-slate-500 mt-0.5">{t("workspace.launch.description")}</p></div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {targets.map(target => {
                      const ready = verifiedTargets.some(item => item.id === target.id);
                      const selected = selectedTargetIds.includes(target.id);
                      return (
                        <button key={target.id} disabled={!ready || detail.campaign.status === "running"} onClick={() => toggleTarget(target.id)} className={`text-start rounded-xl border p-3.5 transition-all ${selected ? "border-sky-400 bg-sky-50 ring-2 ring-sky-100" : ready ? "border-slate-200 hover:border-slate-300 bg-white" : "border-slate-100 bg-slate-50 opacity-65 cursor-not-allowed"}`}>
                          <div className="flex items-start gap-3">
                            <span className={`mt-0.5 w-4.5 h-4.5 rounded border flex items-center justify-center ${selected ? "bg-sky-500 border-sky-500 text-white" : "border-slate-300 bg-white"}`}>{selected && <Check className="w-3 h-3" />}</span>
                            <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="text-xs font-bold text-slate-800 truncate" dir="auto">{target.name}</p><span className={`text-[8px] font-bold rounded-full px-1.5 py-0.5 ${ready ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>{ready ? t("workspace.launch.verified") : t(`common.deliveryStatus.${target.connectionStatus === "ok" ? "success" : target.connectionStatus === "error" ? "failed" : "pending"}`)}</span></div><p className="text-[10px] text-slate-400 mt-1 truncate" dir="ltr">{target.chatId} · {target.chatType ? t(`common.chatType.${target.chatType}`) : t("common.unknownType")}</p><p className="text-[9px] text-slate-400 mt-0.5 truncate">{t("common.bot")} <span dir="auto">{target.botAccount?.name || t("common.unknownBot")}</span></p></div>
                          </div>
                        </button>
                      );
                    })}
                    {targets.length === 0 && <div className="sm:col-span-2 rounded-xl bg-amber-50 border border-amber-200 p-4 text-xs text-amber-800">{t("workspace.launch.noTargets")}</div>}
                  </div>

                  {detail.campaign.status === "running" && detail.deliveries.length > 0 && (
                    <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">{t("workspace.launch.running")}</div>
                  )}

                  <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div><p className="text-xs font-bold text-slate-700">{t("workspace.launch.selected", { count: selectedTargetIds.length, formattedCount: numberFormatter.format(selectedTargetIds.length) })}</p><p className="text-[10px] text-slate-400 mt-0.5">{t("workspace.launch.posts", { count: detail.posts.length, formattedCount: numberFormatter.format(detail.posts.length) })} → {t("workspace.launch.deliveries", { count: numberFormatter.format(detail.posts.length * selectedTargetIds.length) })}</p></div>
                    <div className="flex flex-wrap items-center gap-2">
                      {launchArmed && <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{t("workspace.launch.confirmHint")}</span>}
                      <button disabled={isActionLoading || detail.posts.length === 0 || selectedTargetIds.length === 0} onClick={launchCampaign} className={`inline-flex items-center gap-2 rounded-xl px-5 py-3 text-xs font-bold text-white transition-colors disabled:bg-slate-300 ${launchArmed ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"}`}>{isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}{launchArmed ? t("workspace.launch.confirm") : t("workspace.launch.launch")}</button>
                    </div>
                  </div>
                </div>
              )}

              {detail.deliveries.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-3xs overflow-hidden">
                  <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div><h4 className="text-sm font-bold text-slate-900">{t("workspace.delivery.title")}</h4><p className="text-[10px] text-slate-500 mt-0.5">{t("workspace.delivery.description")}</p></div>
                    {failedDeliveries.length > 0 && (
                      <div className="flex gap-2"><button disabled={isActionLoading || selectedFailedDeliveryIds.length === 0} onClick={() => retryFailed(true)} className="px-3 py-2 rounded-lg border border-rose-200 text-rose-700 disabled:text-slate-300 disabled:border-slate-200 text-[10px] font-bold">{t("workspace.delivery.retrySelected", { count: numberFormatter.format(selectedFailedDeliveryIds.length) })}</button><button disabled={isActionLoading} onClick={() => retryFailed(false)} className="px-3 py-2 rounded-lg bg-rose-600 text-white text-[10px] font-bold">{t("workspace.delivery.retryAll")}</button></div>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-start">
                      <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400"><tr><th className="px-4 py-2.5">{t("workspace.delivery.headers.status")}</th><th className="px-4 py-2.5">{t("workspace.delivery.headers.post")}</th><th className="px-4 py-2.5">{t("workspace.delivery.headers.target")}</th><th className="px-4 py-2.5">{t("workspace.delivery.headers.attempts")}</th><th className="px-4 py-2.5">{t("workspace.delivery.headers.result")}</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {detail.deliveries.map(delivery => {
                          const target = targetMap.get(delivery.targetId);
                          const campaignPost = campaignPostMap.get(delivery.campaignPostId);
                          const attempts = detail.attempts.filter(attempt => attempt.deliveryId === delivery.id);
                          const checked = selectedFailedDeliveryIds.includes(delivery.id);
                          return (
                            <tr key={delivery.id} className="text-xs align-top">
                              <td className="px-4 py-3"><div className="flex items-center gap-2">{delivery.status === "failed" && <input type="checkbox" checked={checked} onChange={() => setSelectedFailedDeliveryIds(current => checked ? current.filter(id => id !== delivery.id) : [...current, delivery.id])} className="rounded border-slate-300" />}{deliveryStatusIcon(delivery.status)}<span className="font-bold text-slate-700 whitespace-nowrap">{t(`common.deliveryStatus.${delivery.status}`)}</span></div></td>
                              <td className="px-4 py-3"><p className="font-mono text-[10px] text-slate-500 max-w-[180px] truncate" dir="ltr">{campaignPost?.postId || delivery.campaignPostId}</p></td>
                              <td className="px-4 py-3"><p className="font-bold text-slate-700 whitespace-nowrap" dir="auto">{target?.name || delivery.targetId}</p><p className="text-[9px] text-slate-400 mt-0.5 font-mono" dir="ltr">{target?.chatId}</p></td>
                              <td className="px-4 py-3"><p className="font-bold text-slate-700">{numberFormatter.format(delivery.attemptCount)}</p>{attempts.length > 0 && <p className="text-[9px] text-slate-400 mt-0.5">{t("workspace.delivery.lastAttempt", { date: campaignDate(attempts[attempts.length - 1]?.attemptedAt, locale) })}</p>}</td>
                              <td className="px-4 py-3 max-w-[300px]">{delivery.warningMessage && <p className="text-[10px] text-amber-700 leading-relaxed" dir="auto">{delivery.warningMessage}</p>}{delivery.errorMessage && <p className="text-[10px] text-rose-600 leading-relaxed" dir="auto">{delivery.errorMessage}</p>}{!delivery.warningMessage && !delivery.errorMessage && delivery.status === "success" && <p className="text-[10px] text-emerald-600 font-semibold">{t("workspace.delivery.success")}</p>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {section === "targets" && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-3xs overflow-hidden">
              <div className="p-5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-sky-600" />
                  <h3 className="text-sm font-bold text-slate-900">{t("workspace.targets.addTitle")}</h3>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  {t("workspace.targets.addDescription")}
                </p>
              </div>

              <div className="p-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{t("workspace.targets.name")}</span>
                  <input
                    value={targetName}
                    dir="auto"
                    onChange={event => setTargetName(event.target.value)}
                    placeholder={t("workspace.targets.namePlaceholder")}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-sky-400"
                  />
                </label>

                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{t("workspace.targets.chatId")}</span>
                  <input
                    value={targetChatId}
                    dir="ltr"
                    onChange={event => setTargetChatId(event.target.value)}
                    placeholder={t("workspace.targets.chatIdPlaceholder")}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-mono outline-none focus:border-sky-400"
                  />
                </label>

                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{t("workspace.targets.chatType")}</span>
                  <select
                    value={targetChatType}
                    onChange={event => setTargetChatType(event.target.value as "channel" | "group" | "supergroup")}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs bg-white outline-none focus:border-sky-400"
                  >
                    <option value="channel">{t("common.chatType.channel")}</option>
                    <option value="group">{t("common.chatType.group")}</option>
                    <option value="supergroup">{t("common.chatType.supergroup")}</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{t("workspace.targets.publishingBot")}</span>
                  <select
                    value={targetBotAccountId}
                    onChange={event => setTargetBotAccountId(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs bg-white outline-none focus:border-sky-400"
                  >
                    <option value="">{t("workspace.targets.selectBot")}</option>
                    {botAccounts.map(account => (
                      <option key={account.id} value={account.id} disabled={!account.enabled || account.credentialConfigured === false}>
                        {account.name}{account.botUsername ? ` (@${account.botUsername})` : ""}{!account.enabled ? ` — ${t("workspace.targets.disabledSuffix")}` : account.credentialConfigured === false ? ` — ${t("workspace.targets.credentialMissingSuffix")}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="px-5 pb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-[10px] text-slate-500">
                  {t("workspace.targets.botHelp")}
                </p>
                <button
                  disabled={isActionLoading || !targetName.trim() || !targetChatId.trim() || !targetBotAccountId}
                  onClick={createPromotionTarget}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 text-white px-4 py-2.5 text-xs font-bold disabled:bg-slate-300"
                >
                  {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {t("workspace.targets.add")}
                </button>
              </div>

              {botAccounts.length === 0 && (
                <div className="mx-5 mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[10px] text-amber-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <span>{t("workspace.targets.registerHelp")}</span>
                  <button
                    type="button"
                    disabled={isActionLoading}
                    onClick={registerPersonalDestinationBot}
                    className="shrink-0 rounded-lg bg-amber-900 px-3 py-2 font-bold text-white disabled:bg-amber-300"
                  >
                    {t("workspace.targets.register")}
                  </button>
                </div>
              )}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-3xs overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{t("workspace.targets.listTitle")}</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {t("workspace.targets.listDescription")}
                </p>
              </div>
              <div className="text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-100 px-3 py-2 rounded-lg">
                {t("workspace.targets.summary", { verified: numberFormatter.format(verifiedTargets.length), total: numberFormatter.format(targets.length) })}
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {targets.map(target => {
                const ready = verifiedTargets.some(item => item.id === target.id);
                return (
                  <div key={target.id} className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center ${ready ? "bg-emerald-50 text-emerald-600" : target.connectionStatus === "error" ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-500"}`}>
                      <Target className="w-5 h-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-slate-900" dir="auto">{target.name}</p>
                        <span className={`text-[9px] font-bold rounded-full px-2 py-0.5 ${ready ? "bg-emerald-100 text-emerald-700" : target.connectionStatus === "error" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>
                          {ready ? t("workspace.targets.ready") : target.connectionStatus === "unknown" ? t("workspace.targets.needsVerification") : t("workspace.targets.connectionError")}
                        </span>
                        {!target.enabled && <span className="text-[9px] font-bold rounded-full px-2 py-0.5 bg-slate-200 text-slate-500">{t("workspace.targets.disabled")}</span>}
                      </div>
                      <p className="text-xs text-slate-500 mt-1" dir="ltr">{target.chatId} · {target.chatType ? t(`common.chatType.${target.chatType}`) : t("workspace.targets.typeNotVerified")}</p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {t("common.bot")} <span dir="auto">{target.botAccount?.name || t("common.unknown")}</span>{target.botAccount?.botUsername ? ` (@${target.botAccount.botUsername})` : ""}
                        {target.lastCheckedAt ? ` · ${t("common.checked", { date: campaignDate(target.lastCheckedAt, locale) })}` : ""}
                      </p>
                      {target.errorMessage && <p className="text-[10px] text-rose-600 mt-1.5" dir="auto">{target.errorMessage}</p>}
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                          disabled={isActionLoading || !target.enabled}
                          onClick={() => testPromotionTarget(target.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 px-3 py-2 text-[10px] font-bold text-sky-700 disabled:text-slate-300 disabled:border-slate-200"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          {ready ? t("workspace.targets.retest") : t("workspace.targets.test")}
                        </button>
                        <button
                          disabled={isActionLoading}
                          onClick={() => setPromotionTargetEnabled(target, !target.enabled)}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600"
                        >
                          {target.enabled ? t("common.disable") : t("common.enable")}
                        </button>
                        <button
                          disabled={isActionLoading}
                          onClick={() => deletePromotionTarget(target)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-[10px] font-bold text-rose-700"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {t("common.delete")}
                        </button>
                    </div>
                  </div>
                );
              })}

              {targets.length === 0 && (
                <div className="p-10 text-center">
                  <Target className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-sm font-bold text-slate-700 mt-3">{t("workspace.targets.emptyTitle")}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {t("workspace.targets.emptyDescription")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {section === "history" && (
        <div className="space-y-3">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs"><h3 className="text-sm font-bold text-slate-900">{t("workspace.history.title")}</h3><p className="text-[11px] text-slate-500 mt-1">{t("workspace.history.description")}</p></div>
          {campaigns.filter(campaign => ["completed", "partial", "failed"].includes(campaign.status)).map(campaign => (
            <button key={campaign.id} onClick={() => openCampaign(campaign.id)} className="w-full bg-white border border-slate-200 rounded-xl p-4 text-start shadow-3xs hover:border-slate-300 transition-colors flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${campaign.status === "completed" ? "bg-emerald-50 text-emerald-600" : campaign.status === "failed" ? "bg-rose-50 text-rose-600" : "bg-orange-50 text-orange-600"}`}>{campaign.status === "completed" ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}</div>
              <div className="min-w-0 flex-1"><div className="flex items-center gap-2 flex-wrap"><p className="text-sm font-bold text-slate-900 truncate" dir="auto">{campaign.name}</p><span className={`border rounded-full px-2 py-0.5 text-[9px] font-bold ${statusClasses[campaign.status]}`}>{t(`common.status.${campaign.status}`)}</span></div><p className="text-[10px] text-slate-400 mt-1">{t("common.startedCompleted", { started: campaignDate(campaign.startedAt, locale), completed: campaignDate(campaign.completedAt, locale) })}</p></div>
              <ChevronRight className="rtl-mirror w-4 h-4 text-slate-300" />
            </button>
          ))}
          {campaigns.filter(campaign => ["completed", "partial", "failed"].includes(campaign.status)).length === 0 && <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center"><History className="w-8 h-8 text-slate-300 mx-auto" /><p className="text-sm font-bold text-slate-700 mt-3">{t("workspace.history.emptyTitle")}</p><p className="text-xs text-slate-500 mt-1">{t("workspace.history.emptyDescription")}</p></div>}
        </div>
      )}
    </div>
  );
}
