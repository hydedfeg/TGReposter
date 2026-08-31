import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
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

const contentModeLabels: Record<PromotionContentMode, string> = {
  original: "Original",
  teaser: "Teaser",
  ai: "AI prepared",
  custom: "Custom",
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

function campaignDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function campaignStatusLabel(status: PromotionCampaign["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
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

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem("curator_token");
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
    if (!response.ok) {
      const message = data?.error || `Promotion request failed (${response.status}).`;
      throw new Error(message);
    }
    return data;
  };

  const loadCampaignsAndTargets = async () => {
    const requests: Promise<any>[] = [
      requestJson("/api/promotion/campaigns"),
      requestJson("/api/promotion/targets"),
    ];
    if (currentUserRole === "super-admin") {
      requests.push(requestJson("/api/promotion/bot-accounts"));
    }

    const [campaignData, targetData, botData] = await Promise.all(requests);
    const nextCampaigns = campaignData.campaigns || [];
    const nextTargets = targetData.targets || [];
    const nextBotAccounts = botData?.botAccounts || [];

    setCampaigns(nextCampaigns);
    setTargets(nextTargets);
    if (currentUserRole === "super-admin") {
      setBotAccounts(nextBotAccounts);
      setTargetBotAccountId(current =>
        current && nextBotAccounts.some((account: PromotionBotAccount) => account.id === current)
          ? current
          : nextBotAccounts.find((account: PromotionBotAccount) => account.enabled)?.id || ""
      );
    }
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
      if (showSuccess) onToast("Promotion workspace refreshed.");
    } catch (error: any) {
      setLocalError(error.message || "Unable to load promotion data.");
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
      setLocalError(error.message || "Unable to load campaign.");
    } finally {
      setIsActionLoading(false);
    }
  };

  const createCampaign = async () => {
    if (!createName.trim()) {
      onToast("Campaign name is required.", "error");
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
      onToast("Promotion campaign created.");
    } catch (error: any) {
      onToast(error.message || "Unable to create campaign.", "error");
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
      onToast(`Campaign marked ${status}.`);
    } catch (error: any) {
      onToast(error.message || "Unable to update campaign.", "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  const deleteCampaign = async () => {
    if (!detail || !window.confirm(`Delete draft campaign “${detail.campaign.name}”?`)) return;
    setIsActionLoading(true);
    try {
      await requestJson(`/api/promotion/campaigns/${detail.campaign.id}`, { method: "DELETE" });
      setDetail(null);
      setSelectedCampaignId(null);
      await loadCampaignsAndTargets();
      setSection("overview");
      onToast("Campaign deleted.");
    } catch (error: any) {
      onToast(error.message || "Unable to delete campaign.", "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  const attachPost = async () => {
    if (!detail || !selectedPostId) {
      onToast("Choose a collected post first.", "error");
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
      onToast("Post added to promotion campaign.");
    } catch (error: any) {
      onToast(error.message || "Unable to attach post.", "error");
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
      onToast(`${contentModeLabels[editMode]} mode requires promotion text before launch.`, "error");
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
      onToast("Promotion copy saved.");
    } catch (error: any) {
      onToast(error.message || "Unable to update promotion copy.", "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  const removeCampaignPost = async (campaignPostId: string) => {
    if (!detail || !window.confirm("Remove this post from the campaign?")) return;
    setIsActionLoading(true);
    try {
      await requestJson(`/api/promotion/campaigns/${detail.campaign.id}/posts/${campaignPostId}`, {
        method: "DELETE",
      });
      await loadCampaignDetail(detail.campaign.id);
      onToast("Post removed from campaign.");
    } catch (error: any) {
      onToast(error.message || "Unable to remove campaign post.", "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  const createPromotionTarget = async () => {
    if (currentUserRole !== "super-admin") return;
    if (!targetName.trim() || !targetChatId.trim() || !targetBotAccountId) {
      onToast("Target name, Telegram chat ID, and bot account are required.", "error");
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
      onToast("Promotion destination created. Test the connection before campaign use.");
    } catch (error: any) {
      onToast(error.message || "Unable to create promotion destination.", "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  const testPromotionTarget = async (targetId: string) => {
    if (currentUserRole !== "super-admin") return;
    setIsActionLoading(true);
    try {
      await requestJson(`/api/promotion/targets/${targetId}/test`, { method: "POST" });
      await loadCampaignsAndTargets();
      onToast("Promotion destination verified and ready for campaigns.");
    } catch (error: any) {
      await loadCampaignsAndTargets().catch(() => undefined);
      onToast(error.message || "Promotion destination verification failed.", "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  const setPromotionTargetEnabled = async (target: PromotionApiTarget, enabled: boolean) => {
    if (currentUserRole !== "super-admin") return;
    setIsActionLoading(true);
    try {
      await requestJson(`/api/promotion/targets/${target.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
      await loadCampaignsAndTargets();
      onToast(enabled ? "Promotion destination enabled." : "Promotion destination disabled.");
    } catch (error: any) {
      onToast(error.message || "Unable to update promotion destination.", "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  const deletePromotionTarget = async (target: PromotionApiTarget) => {
    if (currentUserRole !== "super-admin") return;
    if (!window.confirm(`Delete promotion destination “${target.name}”? Existing delivery history will prevent deletion when required for audit.`)) return;

    setIsActionLoading(true);
    try {
      await requestJson(`/api/promotion/targets/${target.id}`, { method: "DELETE" });
      setSelectedTargetIds(current => current.filter(id => id !== target.id));
      await loadCampaignsAndTargets();
      onToast("Promotion destination deleted.");
    } catch (error: any) {
      onToast(error.message || "Unable to delete promotion destination.", "error");
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
      onToast("Select at least one verified promotion target.", "error");
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
          ? "Promotion campaign delivered successfully."
          : "Campaign finished with delivery results. Review the report below."
      );
    } catch (error: any) {
      onToast(error.message || "Unable to launch promotion campaign.", "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  const retryFailed = async (onlySelected: boolean) => {
    if (!detail) return;
    if (onlySelected && selectedFailedDeliveryIds.length === 0) {
      onToast("Select failed deliveries to retry.", "error");
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
      onToast("Retry finished. Delivery report updated.");
    } catch (error: any) {
      onToast(error.message || "Unable to retry failed deliveries.", "error");
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
        <p className="text-sm font-bold text-slate-800">Loading Promotion Center</p>
        <p className="text-xs text-slate-500 mt-1">Campaigns, targets, and delivery history are being synchronized.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden bg-slate-950 rounded-2xl border border-slate-800 shadow-sm p-6 sm:p-7 text-white">
        <div className="absolute -right-20 -top-24 w-64 h-64 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
          <div>
            <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-bold text-sky-300 mb-3">
              <Megaphone className="w-3.5 h-3.5" />
              Promotion Center
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Campaign distribution workspace</h2>
            <p className="text-sm text-slate-300 mt-2 max-w-2xl leading-relaxed">
              Turn collected posts into controlled promotion campaigns, deliver to verified Telegram channels and groups, and retry only failed destinations.
            </p>
          </div>
          <button
            onClick={() => refreshWorkspace(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-bold transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </section>

      {localError && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex gap-3 text-rose-800">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold">Promotion data could not be loaded</p>
            <p className="text-xs mt-1">{localError}</p>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-2 shadow-3xs flex flex-wrap gap-1">
        {([
          ["overview", BarChart3, "Overview"],
          ["campaigns", Megaphone, "Campaigns"],
          ["create", Plus, "Create Campaign"],
          ["targets", Target, "Promotion Targets"],
          ["history", History, "Delivery History"],
        ] as const).map(([key, Icon, label]) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className={`flex-1 min-w-[135px] inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-bold transition-all ${
              section === key ? "bg-slate-900 text-white shadow-2xs" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {section === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              ["Campaigns", campaignStats.total, Megaphone, "text-sky-600 bg-sky-50"],
              ["Active", campaignStats.active, Rocket, "text-amber-600 bg-amber-50"],
              ["Completed", campaignStats.completed, CheckCircle2, "text-emerald-600 bg-emerald-50"],
              ["Need attention", campaignStats.attention, AlertCircle, "text-rose-600 bg-rose-50"],
            ].map(([label, value, Icon, iconClass]) => (
              <div key={String(label)} className="bg-white border border-slate-200 rounded-xl p-4 shadow-3xs">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconClass}`}>
                  <Icon className="w-4.5 h-4.5" />
                </div>
                <p className="text-2xl font-bold text-slate-900 mt-3">{value}</p>
                <p className="text-[11px] font-semibold text-slate-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-[1.35fr_0.65fr] gap-5">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-3xs overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Recent campaigns</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">Latest promotion activity and campaign state.</p>
                </div>
                <button onClick={() => setSection("campaigns")} className="text-xs font-bold text-sky-600 hover:text-sky-700">View all</button>
              </div>
              {campaigns.length === 0 ? (
                <div className="p-10 text-center">
                  <Megaphone className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-sm font-bold text-slate-700 mt-3">No campaigns yet</p>
                  <p className="text-xs text-slate-500 mt-1">Create the first promotion campaign from collected Telegram posts.</p>
                  <button onClick={() => setSection("create")} className="mt-4 inline-flex items-center gap-2 bg-slate-900 text-white rounded-lg px-4 py-2.5 text-xs font-bold">
                    <Plus className="w-4 h-4" /> Create campaign
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {campaigns.slice(0, 6).map(campaign => (
                    <button key={campaign.id} onClick={() => openCampaign(campaign.id)} className="w-full px-5 py-3.5 flex items-center gap-4 text-left hover:bg-slate-50 transition-colors">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0"><Megaphone className="w-4 h-4" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-slate-900 truncate">{campaign.name}</p>
                          <span className={`inline-flex border rounded-full px-2 py-0.5 text-[9px] font-bold ${statusClasses[campaign.status]}`}>{campaignStatusLabel(campaign.status)}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">Created {campaignDate(campaign.createdAt)}{campaign.createdByUsername ? ` by ${campaign.createdByUsername}` : ""}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-500" />
                <h3 className="text-sm font-bold text-slate-900">Target readiness</h3>
              </div>
              <p className="text-3xl font-bold text-slate-900 mt-5">{verifiedTargets.length}<span className="text-base text-slate-400 font-semibold"> / {targets.length}</span></p>
              <p className="text-xs text-slate-500 mt-1">targets verified and available for campaign launch</p>
              <div className="mt-5 space-y-2">
                {targets.slice(0, 5).map(target => {
                  const ready = verifiedTargets.some(item => item.id === target.id);
                  return (
                    <div key={target.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-700 truncate">{target.name}</p>
                        <p className="text-[10px] text-slate-400 truncate">{target.chatId}</p>
                      </div>
                      <span className={`text-[9px] font-bold px-2 py-1 rounded-full ${ready ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{ready ? "Ready" : "Blocked"}</span>
                    </div>
                  );
                })}
                {targets.length === 0 && <p className="text-xs text-slate-500 py-3">No promotion targets configured yet.</p>}
              </div>
              <button onClick={() => setSection("targets")} className="mt-4 text-xs font-bold text-sky-600">Review targets →</button>
            </div>
          </div>
        </div>
      )}

      {section === "create" && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-3xs max-w-3xl">
          <div className="flex items-start gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center"><Plus className="w-5 h-5" /></div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Create promotion campaign</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">Create the campaign shell first. You will select posts, prepare copy, choose targets, and launch from the campaign workspace.</p>
            </div>
          </div>
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-bold text-slate-700">Campaign name</span>
              <input value={createName} onChange={event => setCreateName(event.target.value)} placeholder="e.g. Weekly technology roundup" className="mt-1.5 w-full border border-slate-200 rounded-xl px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-400" />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-700">Description <span className="font-normal text-slate-400">optional</span></span>
              <textarea value={createDescription} onChange={event => setCreateDescription(event.target.value)} placeholder="Internal campaign notes, objective, audience..." rows={4} className="mt-1.5 w-full border border-slate-200 rounded-xl px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-400 resize-y" />
            </label>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 text-xs text-slate-600 leading-relaxed">
              Campaigns begin as <b>Draft</b>. No Telegram messages are sent until you explicitly select verified targets and confirm launch.
            </div>
            <button disabled={isActionLoading || !createName.trim()} onClick={createCampaign} className="inline-flex items-center gap-2 bg-slate-900 disabled:bg-slate-300 text-white rounded-xl px-5 py-3 text-xs font-bold transition-colors">
              {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create Campaign
            </button>
          </div>
        </div>
      )}

      {section === "campaigns" && (
        <div className="grid xl:grid-cols-[320px_minmax(0,1fr)] gap-5 items-start">
          <aside className="bg-white border border-slate-200 rounded-2xl shadow-3xs overflow-hidden xl:sticky xl:top-4">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div><h3 className="text-sm font-bold text-slate-900">Campaigns</h3><p className="text-[10px] text-slate-500 mt-0.5">{campaigns.length} total</p></div>
              <button onClick={() => setSection("create")} className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center"><Plus className="w-4 h-4" /></button>
            </div>
            <div className="max-h-[680px] overflow-auto divide-y divide-slate-100">
              {campaigns.map(campaign => (
                <button key={campaign.id} onClick={() => openCampaign(campaign.id)} className={`w-full p-4 text-left transition-colors ${selectedCampaignId === campaign.id ? "bg-sky-50" : "hover:bg-slate-50"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-slate-900 truncate">{campaign.name}</p>
                    <span className={`shrink-0 border rounded-full px-2 py-0.5 text-[8px] font-bold ${statusClasses[campaign.status]}`}>{campaignStatusLabel(campaign.status)}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5">{campaignDate(campaign.createdAt)}</p>
                </button>
              ))}
              {campaigns.length === 0 && <div className="p-6 text-xs text-slate-500 text-center">No campaigns yet.</div>}
            </div>
          </aside>

          {!detail ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-3xs">
              <Megaphone className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="text-sm font-bold text-slate-800 mt-3">Select a campaign</h3>
              <p className="text-xs text-slate-500 mt-1">Open a campaign from the list to compose and publish it.</p>
            </div>
          ) : (
            <div className="space-y-5 min-w-0">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xl font-bold text-slate-900 break-words">{detail.campaign.name}</h3>
                      <span className={`border rounded-full px-2.5 py-1 text-[9px] font-bold ${statusClasses[detail.campaign.status]}`}>{campaignStatusLabel(detail.campaign.status)}</span>
                    </div>
                    {detail.campaign.description && <p className="text-xs text-slate-500 mt-2 leading-relaxed max-w-2xl">{detail.campaign.description}</p>}
                    <p className="text-[10px] text-slate-400 mt-2">Created {campaignDate(detail.campaign.createdAt)}{detail.campaign.createdByUsername ? ` by ${detail.campaign.createdByUsername}` : ""}</p>
                  </div>
                  {mutableCampaign && (
                    <div className="flex flex-wrap gap-2 shrink-0">
                      {detail.campaign.status === "draft" && <button onClick={() => updateCampaignStatus("ready")} className="px-3 py-2 rounded-lg border border-sky-200 bg-sky-50 text-sky-700 text-[10px] font-bold">Mark Ready</button>}
                      {detail.campaign.status === "ready" && <button onClick={() => updateCampaignStatus("draft")} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-[10px] font-bold">Back to Draft</button>}
                      <button onClick={deleteCampaign} className="w-8 h-8 rounded-lg border border-rose-100 bg-rose-50 text-rose-500 flex items-center justify-center"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </div>

                {detail.summary.total > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5 pt-5 border-t border-slate-100">
                    <div className="rounded-lg bg-slate-50 p-3"><p className="text-lg font-bold text-slate-900">{detail.summary.total}</p><p className="text-[9px] uppercase tracking-wide font-bold text-slate-400">Deliveries</p></div>
                    <div className="rounded-lg bg-emerald-50 p-3"><p className="text-lg font-bold text-emerald-700">{detail.summary.succeeded}</p><p className="text-[9px] uppercase tracking-wide font-bold text-emerald-500">Succeeded</p></div>
                    <div className="rounded-lg bg-rose-50 p-3"><p className="text-lg font-bold text-rose-700">{detail.summary.failed}</p><p className="text-[9px] uppercase tracking-wide font-bold text-rose-500">Failed</p></div>
                    <div className="rounded-lg bg-amber-50 p-3"><p className="text-lg font-bold text-amber-700">{detail.summary.warnings}</p><p className="text-[9px] uppercase tracking-wide font-bold text-amber-500">Warnings</p></div>
                  </div>
                )}
              </div>

              {mutableCampaign && (
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs">
                  <div className="flex items-center gap-2 mb-4"><FileText className="w-4.5 h-4.5 text-sky-500" /><h4 className="text-sm font-bold text-slate-900">Add collected post</h4></div>
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input value={postSearch} onChange={event => setPostSearch(event.target.value)} placeholder="Search collected posts by channel, ID, or text..." className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-xs outline-none focus:border-sky-400" />
                  </div>
                  <div className="grid md:grid-cols-[1fr_160px_auto] gap-2">
                    <select value={selectedPostId} onChange={event => setSelectedPostId(event.target.value)} className="border border-slate-200 rounded-xl px-3 py-2.5 text-xs bg-white min-w-0">
                      <option value="">Select a collected post ({filteredPosts.length} shown)</option>
                      {filteredPosts.map(post => <option key={post.id} value={post.id}>@{post.channelUsername} — {post.originalText.slice(0, 85) || post.id}</option>)}
                    </select>
                    <select value={selectedContentMode} onChange={event => setSelectedContentMode(event.target.value as PromotionContentMode)} className="border border-slate-200 rounded-xl px-3 py-2.5 text-xs bg-white">
                      {Object.entries(contentModeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <button onClick={attachPost} disabled={!selectedPostId || isActionLoading} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 disabled:bg-slate-300 text-white text-xs font-bold"><Plus className="w-4 h-4" /> Add</button>
                  </div>
                  {selectedContentMode === "ai" && <p className="text-[10px] text-violet-600 mt-2">AI generation controls arrive in Step 6. For now, AI mode accepts prepared text manually in the composer.</p>}
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
                            <p className="text-xs font-bold text-slate-800">@{campaignPost.sourcePost?.channelUsername || "unknown"}</p>
                            <span className="bg-slate-100 text-slate-600 rounded-full px-2 py-0.5 text-[9px] font-bold">{contentModeLabels[campaignPost.contentMode]}</span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1.5 font-mono break-all">{campaignPost.postId}</p>
                        </div>
                        {mutableCampaign && !editing && (
                          <div className="flex gap-1.5">
                            <button onClick={() => beginEditPost(campaignPost)} className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 flex items-center justify-center hover:bg-slate-50"><Edit3 className="w-3.5 h-3.5" /></button>
                            <button onClick={() => removeCampaignPost(campaignPost.id)} className="w-8 h-8 rounded-lg border border-rose-100 text-rose-500 bg-rose-50 flex items-center justify-center"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        )}
                      </div>

                      {editing ? (
                        <div className="mt-4 grid gap-3">
                          <label><span className="text-[10px] font-bold text-slate-600">Content mode</span><select value={editMode} onChange={event => setEditMode(event.target.value as PromotionContentMode)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 text-xs bg-white">{Object.entries(contentModeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                          {editMode !== "original" && (
                            <label><span className="text-[10px] font-bold text-slate-600">Promotion text</span><textarea value={editPromotionText} onChange={event => setEditPromotionText(event.target.value)} rows={6} placeholder={editMode === "ai" ? "Prepared AI copy will be generated here in Step 6. You can enter it manually now." : "Write the promotional version of this post..."} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 text-xs leading-relaxed resize-y outline-none focus:border-sky-400" /></label>
                          )}
                          <div className="grid sm:grid-cols-2 gap-3">
                            <label><span className="text-[10px] font-bold text-slate-600">Call to action</span><input value={editCtaText} onChange={event => setEditCtaText(event.target.value)} placeholder="Read more / Join the channel..." className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 text-xs outline-none focus:border-sky-400" /></label>
                            <label><span className="text-[10px] font-bold text-slate-600">Source link override</span><input value={editSourceLink} onChange={event => setEditSourceLink(event.target.value)} placeholder="https://t.me/..." className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 text-xs outline-none focus:border-sky-400" /></label>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={saveCampaignPost} disabled={isActionLoading} className="inline-flex items-center gap-2 bg-slate-900 text-white rounded-lg px-4 py-2.5 text-xs font-bold"><Check className="w-4 h-4" /> Save copy</button>
                            <button onClick={() => setEditingPostId(null)} className="px-4 py-2.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-4 grid lg:grid-cols-2 gap-4">
                          <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                            <p className="text-[9px] uppercase tracking-widest font-bold text-slate-400 mb-2">Original collected post</p>
                            <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed line-clamp-[12]">{campaignPost.sourcePost?.originalText || "Source post unavailable."}</p>
                          </div>
                          <div className="rounded-xl bg-sky-50/60 border border-sky-100 p-4">
                            <p className="text-[9px] uppercase tracking-widest font-bold text-sky-500 mb-2">Telegram preview</p>
                            <p className={`text-xs whitespace-pre-wrap leading-relaxed ${preview ? "text-slate-700" : "text-rose-600"}`}>{preview || "Promotion copy is not ready yet."}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {detail.posts.length === 0 && (
                  <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center"><FileText className="w-8 h-8 text-slate-300 mx-auto" /><p className="text-sm font-bold text-slate-700 mt-3">Campaign has no posts</p><p className="text-xs text-slate-500 mt-1">Add one or more collected posts before selecting promotion targets.</p></div>
                )}
              </div>

              {launchableCampaign && (
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><Target className="w-4.5 h-4.5" /></div>
                    <div><h4 className="text-sm font-bold text-slate-900">Select promotion targets</h4><p className="text-[11px] text-slate-500 mt-0.5">Only verified, enabled targets can be selected. A failed target will not block successful destinations.</p></div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {targets.map(target => {
                      const ready = verifiedTargets.some(item => item.id === target.id);
                      const selected = selectedTargetIds.includes(target.id);
                      return (
                        <button key={target.id} disabled={!ready || detail.campaign.status === "running"} onClick={() => toggleTarget(target.id)} className={`text-left rounded-xl border p-3.5 transition-all ${selected ? "border-sky-400 bg-sky-50 ring-2 ring-sky-100" : ready ? "border-slate-200 hover:border-slate-300 bg-white" : "border-slate-100 bg-slate-50 opacity-65 cursor-not-allowed"}`}>
                          <div className="flex items-start gap-3">
                            <span className={`mt-0.5 w-4.5 h-4.5 rounded border flex items-center justify-center ${selected ? "bg-sky-500 border-sky-500 text-white" : "border-slate-300 bg-white"}`}>{selected && <Check className="w-3 h-3" />}</span>
                            <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="text-xs font-bold text-slate-800 truncate">{target.name}</p><span className={`text-[8px] font-bold rounded-full px-1.5 py-0.5 ${ready ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>{ready ? "Verified" : target.connectionStatus}</span></div><p className="text-[10px] text-slate-400 mt-1 truncate">{target.chatId} · {target.chatType || "unknown type"}</p><p className="text-[9px] text-slate-400 mt-0.5 truncate">Bot: {target.botAccount?.name || "Unknown bot"}</p></div>
                          </div>
                        </button>
                      );
                    })}
                    {targets.length === 0 && <div className="sm:col-span-2 rounded-xl bg-amber-50 border border-amber-200 p-4 text-xs text-amber-800">No promotion targets exist yet. A Super Admin must configure and verify at least one target before a campaign can launch.</div>}
                  </div>

                  {detail.campaign.status === "running" && detail.deliveries.length > 0 && (
                    <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">This campaign is already running. Resume uses the original target set stored by the backend.</div>
                  )}

                  <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div><p className="text-xs font-bold text-slate-700">{selectedTargetIds.length} target{selectedTargetIds.length === 1 ? "" : "s"} selected</p><p className="text-[10px] text-slate-400 mt-0.5">{detail.posts.length} campaign post{detail.posts.length === 1 ? "" : "s"} → up to {detail.posts.length * selectedTargetIds.length} deliveries</p></div>
                    <div className="flex flex-wrap items-center gap-2">
                      {launchArmed && <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Press again to confirm publishing</span>}
                      <button disabled={isActionLoading || detail.posts.length === 0 || selectedTargetIds.length === 0} onClick={launchCampaign} className={`inline-flex items-center gap-2 rounded-xl px-5 py-3 text-xs font-bold text-white transition-colors disabled:bg-slate-300 ${launchArmed ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"}`}>{isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}{launchArmed ? "Confirm Launch" : "Launch Campaign"}</button>
                    </div>
                  </div>
                </div>
              )}

              {detail.deliveries.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-3xs overflow-hidden">
                  <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div><h4 className="text-sm font-bold text-slate-900">Delivery report</h4><p className="text-[10px] text-slate-500 mt-0.5">Per-target result and retry audit trail.</p></div>
                    {failedDeliveries.length > 0 && (
                      <div className="flex gap-2"><button disabled={isActionLoading || selectedFailedDeliveryIds.length === 0} onClick={() => retryFailed(true)} className="px-3 py-2 rounded-lg border border-rose-200 text-rose-700 disabled:text-slate-300 disabled:border-slate-200 text-[10px] font-bold">Retry selected ({selectedFailedDeliveryIds.length})</button><button disabled={isActionLoading} onClick={() => retryFailed(false)} className="px-3 py-2 rounded-lg bg-rose-600 text-white text-[10px] font-bold">Retry all failed</button></div>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left">
                      <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400"><tr><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Post</th><th className="px-4 py-2.5">Target</th><th className="px-4 py-2.5">Attempts</th><th className="px-4 py-2.5">Result</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {detail.deliveries.map(delivery => {
                          const target = targetMap.get(delivery.targetId);
                          const campaignPost = campaignPostMap.get(delivery.campaignPostId);
                          const attempts = detail.attempts.filter(attempt => attempt.deliveryId === delivery.id);
                          const checked = selectedFailedDeliveryIds.includes(delivery.id);
                          return (
                            <tr key={delivery.id} className="text-xs align-top">
                              <td className="px-4 py-3"><div className="flex items-center gap-2">{delivery.status === "failed" && <input type="checkbox" checked={checked} onChange={() => setSelectedFailedDeliveryIds(current => checked ? current.filter(id => id !== delivery.id) : [...current, delivery.id])} className="rounded border-slate-300" />}{deliveryStatusIcon(delivery.status)}<span className="font-bold text-slate-700 capitalize whitespace-nowrap">{delivery.status.replace("_", " ")}</span></div></td>
                              <td className="px-4 py-3"><p className="font-mono text-[10px] text-slate-500 max-w-[180px] truncate">{campaignPost?.postId || delivery.campaignPostId}</p></td>
                              <td className="px-4 py-3"><p className="font-bold text-slate-700 whitespace-nowrap">{target?.name || delivery.targetId}</p><p className="text-[9px] text-slate-400 mt-0.5">{target?.chatId}</p></td>
                              <td className="px-4 py-3"><p className="font-bold text-slate-700">{delivery.attemptCount}</p>{attempts.length > 0 && <p className="text-[9px] text-slate-400 mt-0.5">Last {campaignDate(attempts[attempts.length - 1]?.attemptedAt)}</p>}</td>
                              <td className="px-4 py-3 max-w-[300px]">{delivery.warningMessage && <p className="text-[10px] text-amber-700 leading-relaxed">{delivery.warningMessage}</p>}{delivery.errorMessage && <p className="text-[10px] text-rose-600 leading-relaxed">{delivery.errorMessage}</p>}{!delivery.warningMessage && !delivery.errorMessage && delivery.status === "success" && <p className="text-[10px] text-emerald-600 font-semibold">Published successfully</p>}</td>
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
          {currentUserRole === "super-admin" && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-3xs overflow-hidden">
              <div className="p-5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-sky-600" />
                  <h3 className="text-sm font-bold text-slate-900">Add campaign destination</h3>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Add the Telegram channel or group that campaigns may publish to. A connection test is required before the destination becomes selectable.
                </p>
              </div>

              <div className="p-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Destination name</span>
                  <input
                    value={targetName}
                    onChange={event => setTargetName(event.target.value)}
                    placeholder="Partner News Channel"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-sky-400"
                  />
                </label>

                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Telegram chat ID / @username</span>
                  <input
                    value={targetChatId}
                    onChange={event => setTargetChatId(event.target.value)}
                    placeholder="@channel or -100..."
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-mono outline-none focus:border-sky-400"
                  />
                </label>

                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Chat type</span>
                  <select
                    value={targetChatType}
                    onChange={event => setTargetChatType(event.target.value as "channel" | "group" | "supergroup")}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs bg-white outline-none focus:border-sky-400"
                  >
                    <option value="channel">Channel</option>
                    <option value="group">Group</option>
                    <option value="supergroup">Supergroup</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Publishing bot</span>
                  <select
                    value={targetBotAccountId}
                    onChange={event => setTargetBotAccountId(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs bg-white outline-none focus:border-sky-400"
                  >
                    <option value="">Select bot account</option>
                    {botAccounts.map(account => (
                      <option key={account.id} value={account.id} disabled={!account.enabled || account.credentialConfigured === false}>
                        {account.name}{account.botUsername ? ` (@${account.botUsername})` : ""}{!account.enabled ? " — disabled" : account.credentialConfigured === false ? " — credential missing" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="px-5 pb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-[10px] text-slate-500">
                  The bot must already be a member/admin of the destination with permission to post.
                </p>
                <button
                  disabled={isActionLoading || !targetName.trim() || !targetChatId.trim() || !targetBotAccountId}
                  onClick={createPromotionTarget}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 text-white px-4 py-2.5 text-xs font-bold disabled:bg-slate-300"
                >
                  {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Add destination
                </button>
              </div>

              {botAccounts.length === 0 && (
                <div className="mx-5 mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[10px] text-amber-800">
                  No Promotion bot account is available. The existing Destination Bot can be registered as a Promotion bot account first.
                </div>
              )}
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-2xl shadow-3xs overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Campaign destinations</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  These channels and groups are the destination pool shown when launching a campaign.
                </p>
              </div>
              <div className="text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-100 px-3 py-2 rounded-lg">
                {verifiedTargets.length} verified · {targets.length} total
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
                        <p className="text-sm font-bold text-slate-900">{target.name}</p>
                        <span className={`text-[9px] font-bold rounded-full px-2 py-0.5 ${ready ? "bg-emerald-100 text-emerald-700" : target.connectionStatus === "error" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>
                          {ready ? "Ready for campaigns" : target.connectionStatus === "unknown" ? "Needs verification" : "Connection error"}
                        </span>
                        {!target.enabled && <span className="text-[9px] font-bold rounded-full px-2 py-0.5 bg-slate-200 text-slate-500">Disabled</span>}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{target.chatId} · {target.chatType || "type not verified"}</p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Bot: {target.botAccount?.name || "Unknown"}{target.botAccount?.botUsername ? ` (@${target.botAccount.botUsername})` : ""}
                        {target.lastCheckedAt ? ` · Checked ${campaignDate(target.lastCheckedAt)}` : ""}
                      </p>
                      {target.errorMessage && <p className="text-[10px] text-rose-600 mt-1.5">{target.errorMessage}</p>}
                    </div>

                    {currentUserRole === "super-admin" ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          disabled={isActionLoading || !target.enabled}
                          onClick={() => testPromotionTarget(target.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 px-3 py-2 text-[10px] font-bold text-sky-700 disabled:text-slate-300 disabled:border-slate-200"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          {ready ? "Re-test" : "Test connection"}
                        </button>
                        <button
                          disabled={isActionLoading}
                          onClick={() => setPromotionTargetEnabled(target, !target.enabled)}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600"
                        >
                          {target.enabled ? "Disable" : "Enable"}
                        </button>
                        <button
                          disabled={isActionLoading}
                          onClick={() => deletePromotionTarget(target)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-[10px] font-bold text-rose-700"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </div>
                    ) : (
                      <div className="text-[10px] font-semibold text-slate-400">
                        {ready ? "Selectable for campaigns" : "Not selectable"}
                      </div>
                    )}
                  </div>
                );
              })}

              {targets.length === 0 && (
                <div className="p-10 text-center">
                  <Target className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-sm font-bold text-slate-700 mt-3">No campaign destinations configured</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {currentUserRole === "super-admin"
                      ? "Add a Telegram channel or group above, then test its connection."
                      : "Ask a Super Admin to configure and verify a Promotion destination."}
                  </p>
                </div>
              )}
            </div>

            {currentUserRole === "admin" && (
              <div className="px-5 py-3 bg-amber-50 border-t border-amber-100 text-[10px] text-amber-700">
                Admins can select verified campaign destinations but cannot change Telegram infrastructure.
              </div>
            )}
          </div>
        </div>
      )}

      {section === "history" && (
        <div className="space-y-3">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs"><h3 className="text-sm font-bold text-slate-900">Delivery history</h3><p className="text-[11px] text-slate-500 mt-1">Completed, partial, and failed campaigns are retained as an audit trail. Open a campaign to inspect individual delivery attempts.</p></div>
          {campaigns.filter(campaign => ["completed", "partial", "failed"].includes(campaign.status)).map(campaign => (
            <button key={campaign.id} onClick={() => openCampaign(campaign.id)} className="w-full bg-white border border-slate-200 rounded-xl p-4 text-left shadow-3xs hover:border-slate-300 transition-colors flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${campaign.status === "completed" ? "bg-emerald-50 text-emerald-600" : campaign.status === "failed" ? "bg-rose-50 text-rose-600" : "bg-orange-50 text-orange-600"}`}>{campaign.status === "completed" ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}</div>
              <div className="min-w-0 flex-1"><div className="flex items-center gap-2 flex-wrap"><p className="text-sm font-bold text-slate-900 truncate">{campaign.name}</p><span className={`border rounded-full px-2 py-0.5 text-[9px] font-bold ${statusClasses[campaign.status]}`}>{campaignStatusLabel(campaign.status)}</span></div><p className="text-[10px] text-slate-400 mt-1">Started {campaignDate(campaign.startedAt)} · Completed {campaignDate(campaign.completedAt)}</p></div>
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </button>
          ))}
          {campaigns.filter(campaign => ["completed", "partial", "failed"].includes(campaign.status)).length === 0 && <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center"><History className="w-8 h-8 text-slate-300 mx-auto" /><p className="text-sm font-bold text-slate-700 mt-3">No delivery history yet</p><p className="text-xs text-slate-500 mt-1">Campaign results will appear here after the first launch.</p></div>}
        </div>
      )}
    </div>
  );
}
