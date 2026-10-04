import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, Info, RefreshCw } from "lucide-react";
import Header from "./components/Header";
import AppShell, { type WorkspaceView } from "./components/AppShell";
import Dashboard from "./components/Dashboard";
import SourceChannelsConfig from "./components/SourceChannelsConfig";
import FilterConfig from "./components/FilterConfig";
import DestinationConfig from "./components/DestinationConfig";
import CurationFeed from "./components/CurationFeed";
import DatabaseConfig from "./components/DatabaseConfig";
import AIConfigView from "./components/AIConfig";
import Login from "./components/Login";
import UserManagement from "./components/UserManagement";
import { FilterConfig as IFilterConfig, DestinationConfig as IDestinationConfig, DestinationTarget, CuratedPost, CuratorSettings, AIConfig as IAIConfig } from "./types";
import { safeResponseJson } from "./utils/api";
import { reconcileAuthenticatedAppLocale } from "./i18n/userLocalePreference";
import { normalizeAppLocale } from "./i18n";
import { API_ERROR_CODES } from "../shared/apiErrorCodes";

import { WorkspaceSession } from "./utils/workspaceSession";

const superAdminViews = new Set<WorkspaceView>(["team", "database"]);

const PUBLISHING_ERROR_KEYS: Record<string, string> = {
  [API_ERROR_CODES.publishing.postNotFound]: "runtime.publishing.errors.postNotFound",
  [API_ERROR_CODES.publishing.postNotApproved]: "runtime.publishing.errors.postNotApproved",
  [API_ERROR_CODES.publishing.destinationsLoadFailed]: "runtime.publishing.errors.destinationsLoadFailed",
  [API_ERROR_CODES.publishing.credentialLoadFailed]: "runtime.publishing.errors.credentialLoadFailed",
  [API_ERROR_CODES.publishing.botNotConfigured]: "runtime.publishing.errors.botNotConfigured",
  [API_ERROR_CODES.publishing.targetIdsInvalid]: "runtime.publishing.errors.targetIdsInvalid",
  [API_ERROR_CODES.publishing.targetIdInvalid]: "runtime.publishing.errors.targetIdInvalid",
  [API_ERROR_CODES.publishing.noTargetsSelected]: "runtime.publishing.errors.noTargetsSelected",
  [API_ERROR_CODES.publishing.unknownTargets]: "runtime.publishing.errors.unknownTargets",
  [API_ERROR_CODES.publishing.disabledTargets]: "runtime.publishing.errors.disabledTargets",
  [API_ERROR_CODES.publishing.noEnabledTargets]: "runtime.publishing.errors.noEnabledTargets",
  [API_ERROR_CODES.publishing.inboxStateSaveFailed]: "runtime.publishing.errors.inboxStateSaveFailed",
};

function sanitizeClientSettings(settings: CuratorSettings): CuratorSettings {
  return {
    ...settings,
    destination: {
      ...settings.destination,
      botToken: "",
    },
  };
}

function settingsCacheKey() {
  const accountKey = localStorage.getItem("curator_account_key")?.trim().toLowerCase();
  return `telegram-curator-settings:${accountKey || "anonymous"}`;
}

function initialWorkspaceView(): WorkspaceView {
  const stored = sessionStorage.getItem("tgreposter-active-view") as WorkspaceView | null;
  const validViews: WorkspaceView[] = ["dashboard", "feed", "history", "channels", "filters", "destination", "ai", "team", "database"];
  return stored && validViews.includes(stored) ? stored : "dashboard";
}

function emptyWorkspace(): CuratorSettings {
  return {
    channels: [],
    filters: {
      positiveKeywords: [],
      negativeKeywords: [],
      requiredHashtags: [],
      caseSensitive: false
    },
    destination: {
      botToken: "",
      channelId: "",
      connected: false,
      targets: []
    },
    posts: [],
    users: []
  };
}

export default function App() {
  const { t, i18n } = useTranslation("common");
  const locale = normalizeAppLocale(i18n.language);
  const numberFormatter = new Intl.NumberFormat(locale);
  const session = useRef(new WorkspaceSession()).current;
  const [settings, setSettings] = useState<CuratorSettings>(emptyWorkspace);

  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceView>(initialWorkspaceView);
  const [isLoading, setIsLoading] = useState(true);
  const [isScraping, setIsScraping] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successToast, setSuccessToast] = useState("");
  const [geminiActive, setGeminiActive] = useState(false);
  const [openrouterActive, setOpenrouterActive] = useState(false);

  // Authentication State
  const [authToken, setAuthToken] = useState<string | null>(localStorage.getItem("curator_token"));
  const isCurrent = session.capture(authToken);
  const [passwordSet, setPasswordSet] = useState<boolean | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [currentUserRole, setCurrentUserRole] = useState<'super-admin' | 'admin' | null>(
    (localStorage.getItem("curator_role") as 'super-admin' | 'admin') || null
  );
  const [currentUsername, setCurrentUsername] = useState<string | null>(
    localStorage.getItem("curator_username") || null
  );

  useEffect(() => {
    if (currentUserRole === "admin" && superAdminViews.has(activeWorkspaceTab)) {
      setActiveWorkspaceTab("dashboard");
      sessionStorage.setItem("tgreposter-active-view", "dashboard");
    }
  }, [activeWorkspaceTab, currentUserRole]);

  const resetWorkspace = () => {
    session.invalidate();
    setSettings(emptyWorkspace());
    setGeminiActive(false);
    setOpenrouterActive(false);
    setIsScraping(false);
    setErrorMessage("");
    setSuccessToast("");
  };

  const clearSession = () => {
    resetWorkspace();
    localStorage.removeItem(settingsCacheKey());
    for (const key of ["curator_token", "curator_role", "curator_username", "curator_account_key"]) {
      localStorage.removeItem(key);
    }
    setAuthToken(null);
    setCurrentUserRole(null);
    setCurrentUsername(null);
    setIsAuthenticated(false);
    setIsLoading(false);
    setAuthChecking(false);
  };

  const loadSettings = async (token: string | null, current = isCurrent) => {
    if (!current()) return;
    const cacheKey = settingsCacheKey();
    setIsLoading(true);
    try {
      const response = await fetch("/api/settings", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!current()) return;
      if (response.status === 401) {
        clearSession();
        return;
      }
      if (!response.ok) throw new Error("Failed to load settings from server");
      const data = await safeResponseJson(response);
      if (!current()) return;
      const safeData = sanitizeClientSettings(data);
      setSettings(safeData);
      localStorage.setItem(cacheKey, JSON.stringify(safeData));
      setPasswordSet(data.passwordSet);
      setGeminiActive(!!data.geminiActive);
      setOpenrouterActive(!!data.openrouterActive);
    } catch (err) {
      if (!current()) return;
      console.error("Error loading configuration:", err);
      let fallback = emptyWorkspace();
      let cached = false;
      try {
        const local = localStorage.getItem(cacheKey);
        if (local) {
          fallback = sanitizeClientSettings(JSON.parse(local));
          cached = true;
        }
      } catch (_) {}
      setSettings(fallback);
      setErrorMessage(cached
        ? t("runtime.errors.settingsCached")
        : t("runtime.errors.settingsUnavailable"));
    } finally {
      if (current()) setIsLoading(false);
    }
  };

  // The effect owns its own guard so StrictMode cleanup and route unmounts also
  // invalidate initialization, without allowing a late status response to log in.
  useEffect(() => {
    const current = session.capture();
    const savedToken = localStorage.getItem("curator_token");
    const initialize = async () => {
      try {
        const response = await fetch("/api/auth/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: savedToken }),
        });
        const data = await safeResponseJson(response);
        if (!current()) return;
        if (!response.ok) throw new Error("Unable to verify session");
        setPasswordSet(data.passwordSet);
        if (!data.authenticated || !savedToken || !data.accountKey) {
          clearSession();
          return;
        }
        await reconcileAuthenticatedAppLocale(data.uiLocale, savedToken);
        if (!current()) return;
        setIsAuthenticated(true);
        setAuthToken(savedToken);
        setCurrentUserRole(data.role);
        setCurrentUsername(data.username);
        localStorage.setItem("curator_role", data.role || "");
        localStorage.setItem("curator_username", data.username || "");
        localStorage.setItem("curator_account_key", data.accountKey);
        await loadSettings(savedToken, current);
      } catch (error) {
        if (!current()) return;
        clearSession();
        setPasswordSet(true);
        setErrorMessage(t("runtime.errors.sessionVerify"));
      } finally {
        if (current()) setAuthChecking(false);
      }
    };
    void initialize();
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === "curator_token" || event.key === "curator_account_key") {
        // A different tab changed identity. Unmount private children and require
        // revalidation; do not remove the other tab's newly saved credentials.
        resetWorkspace();
        setIsAuthenticated(false);
        setAuthToken(localStorage.getItem("curator_token"));
        setCurrentUserRole(null);
        setCurrentUsername(null);
        setAuthChecking(false);
        setIsLoading(false);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      session.invalidate();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Generic authenticated fetch helper
  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    if (!isCurrent()) throw new Error(t("runtime.errors.sessionChanged"));
    const savedToken = authToken;
    const headers = {
      ...options.headers,
      "Content-Type": "application/json",
      ...(savedToken ? { "Authorization": `Bearer ${savedToken}` } : {})
    };
    return fetch(url, { ...options, headers });
  };

  // Save settings helper
  const saveSettingsToServer = async (
    updated: CuratorSettings,
    serverPatch: Partial<CuratorSettings> = updated
  ) => {
    if (!isCurrent()) return false;
    const cacheKey = settingsCacheKey();
    const safeUpdated = sanitizeClientSettings(updated);

    // Keep a token-free local fallback only.
    localStorage.setItem(cacheKey, JSON.stringify(safeUpdated));
    setSettings(safeUpdated);

    try {
      const response = await fetchWithAuth("/api/settings", {
        method: "POST",
        body: JSON.stringify(serverPatch)
      });
      if (!response.ok) {
        throw new Error(t("runtime.errors.configPersist"));
      }
      const data = await safeResponseJson(response);
      if (!isCurrent()) return false;
      const safeData = sanitizeClientSettings(data);
      setSettings(safeData);
      localStorage.setItem(cacheKey, JSON.stringify(safeData));
      setPasswordSet(data.passwordSet);
      setGeminiActive(!!data.geminiActive);
      setOpenrouterActive(!!data.openrouterActive);
    } catch (err: any) {
      if (!isCurrent()) return false;
      console.error("Error saving configuration:", err);
      showToast(t("runtime.errors.configPersist"), "error");
    }
  };

  const handleLoginSuccess = async (
    token: string,
    isNewSetup: boolean,
    role: 'super-admin' | 'admin',
    username: string,
    accountKey: string,
    uiLocale: string | null
  ) => {
    if (!isCurrent()) return;
    await reconcileAuthenticatedAppLocale(uiLocale, token);
    resetWorkspace();
    localStorage.setItem("curator_token", token);
    localStorage.setItem("curator_role", role);
    localStorage.setItem("curator_username", username);
    localStorage.setItem("curator_account_key", accountKey);
    setAuthToken(token);
    setCurrentUserRole(role);
    setCurrentUsername(username);
    setIsAuthenticated(true);
    setPasswordSet(true);
    setSuccessToast(isNewSetup ? t("runtime.auth.ownerReady") : t("runtime.auth.welcome", { username }));
    loadSettings(token, session.capture());
  };

  const handleLogout = async () => {
    if (!isCurrent()) return;
    const token = authToken;
    // Clear private state before waiting for the network.
    clearSession();
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
    } catch (error) {
      console.error("Logout notification failed:", error);
    }
  };

  const handleAddUser = async (username: string, password: string, role: "super-admin" | "admin"): Promise<boolean> => {
    if (!isCurrent()) return false;
    try {
      const response = await fetchWithAuth("/api/users/add", {
        method: "POST",
        body: JSON.stringify({ username, password, role })
      });
      if (!response.ok) {
        const data = await safeResponseJson(response);
        if (!isCurrent()) return false;
        throw new Error(data.error || t("runtime.users.addFailed"));
      }
      const data = await safeResponseJson(response);
      if (!isCurrent()) return false;
      setSettings(prev => ({ ...prev, users: data.users }));
      showToast(t("runtime.users.registered", { username }));
      return true;
    } catch (err: any) {
      if (!isCurrent()) return false;
      showToast(err.message || t("runtime.users.addFailed"), "error");
      return false;
    }
  };

  const handleDeleteUser = async (username: string): Promise<boolean> => {
    if (!isCurrent()) return false;
    try {
      const response = await fetchWithAuth("/api/users/delete", {
        method: "POST",
        body: JSON.stringify({ username })
      });
      if (!response.ok) {
        const data = await safeResponseJson(response);
        if (!isCurrent()) return false;
        throw new Error(data.error || t("runtime.users.revokeFailed"));
      }
      const data = await safeResponseJson(response);
      if (!isCurrent()) return false;
      setSettings(prev => ({ ...prev, users: data.users }));
      showToast(t("runtime.users.revoked", { username }));
      return true;
    } catch (err: any) {
      if (!isCurrent()) return false;
      showToast(err.message || t("runtime.users.revokeFailed"), "error");
      return false;
    }
  };

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    if (!isCurrent()) return;
    if (type === "success") {
      setSuccessToast(msg);
      setTimeout(() => { if (isCurrent()) setSuccessToast(""); }, 4000);
    } else {
      setErrorMessage(msg);
      setTimeout(() => { if (isCurrent()) setErrorMessage(""); }, 5000);
    }
  };

  const handleNavigate = (view: WorkspaceView) => {
    if (view === "promotion") {
      window.location.hash = "promotion";
      return;
    }
    if (currentUserRole !== "super-admin" && superAdminViews.has(view)) {
      setActiveWorkspaceTab("dashboard");
      sessionStorage.setItem("tgreposter-active-view", "dashboard");
      return;
    }
    setActiveWorkspaceTab(view);
    sessionStorage.setItem("tgreposter-active-view", view);
  };

  // 1. Channel actions
  const handleAddChannel = async (username: string) => {
    if (!isCurrent()) return;
    const cleanUsername = username.trim().toLowerCase();
    const updatedChannels = [...settings.channels, { username: cleanUsername, status: "idle" as const }];
    const updated = { ...settings, channels: updatedChannels };
    await saveSettingsToServer(updated, { channels: updatedChannels });
    if (!isCurrent()) return;
    showToast(t("runtime.channels.added", { username: cleanUsername }));
    // Auto fetch the newly added channel
    handleFetchChannel(cleanUsername);
  };

  const handleRemoveChannel = async (username: string) => {
    if (!isCurrent()) return;
    const updatedChannels = settings.channels.filter(c => c.username !== username);
    const updated = { ...settings, channels: updatedChannels };
    await saveSettingsToServer(updated, { channels: updatedChannels });
    if (!isCurrent()) return;
    showToast(t("runtime.channels.removed", { username }));
  };

  // 2. Filter actions
  const handleUpdateFilters = async (updatedFilters: IFilterConfig) => {
    if (!isCurrent()) return;
    const updated = { ...settings, filters: updatedFilters };
    await saveSettingsToServer(updated, { filters: updatedFilters });
    if (!isCurrent()) return;
    showToast(t("runtime.filters.updated"));
  };

  // 3. Destination configuration actions
  const handleSaveDestination = async (botToken: string, targets: DestinationTarget[]): Promise<boolean> => {
    if (!isCurrent()) return false;
    let botTokenConfigured = !!settings.destination.botTokenConfigured;

    if (botToken.trim()) {
      try {
        const tokenResponse = await fetchWithAuth("/api/destination/bot-token", {
          method: "POST",
          body: JSON.stringify({ botToken: botToken.trim() }),
        });
        const tokenResult = await safeResponseJson(tokenResponse);
        if (!isCurrent()) return false;

        if (!tokenResponse.ok || !tokenResult.success) {
          throw new Error(tokenResult.error || t("runtime.destinations.tokenStoreFailed"));
        }

        botTokenConfigured = true;
      } catch (err: any) {
        if (!isCurrent()) return false;
        showToast(err?.message || t("runtime.destinations.tokenStoreFailed"), "error");
        return false;
      }
    }

    const updatedDestination: IDestinationConfig = {
      ...settings.destination,
      botToken: "",
      botTokenConfigured,
      targets,
      connected:
        settings.destination.connected ||
        targets.some(target => target.status === "success"),
    };

    const updated = { ...settings, destination: updatedDestination };
    await saveSettingsToServer(updated, { destination: updatedDestination });
    if (!isCurrent()) return false;
    showToast(botToken.trim() ? t("runtime.destinations.tokenStored") : t("runtime.destinations.updated"));
    return true;
  };

  const handleUpdateAI = async (updatedAI: IAIConfig) => {
    if (!isCurrent()) return;
    const updated = { ...settings, aiConfig: updatedAI };
    await saveSettingsToServer(updated, { aiConfig: updatedAI });
    if (!isCurrent()) return;
    showToast(t("runtime.ai.updated"));
  };

  // 4. Manual Post Tweaks or status changes
  const handleUpdatePost = async (postId: string, updatedFields: Partial<CuratedPost>) => {
    if (!isCurrent()) return;
    let changedPost: CuratedPost | null = null;
    const updatedPosts = settings.posts.map(post => {
      if (post.id === postId) {
        changedPost = { ...post, ...updatedFields };
        return changedPost;
      }
      return post;
    });

    if (!changedPost) return;

    const updated = { ...settings, posts: updatedPosts };
    // Persist only this user's changed row in their private Content Inbox.
    await saveSettingsToServer(updated, { posts: [changedPost] });
  };

  // 5. Scraper triggers
  const handleFetchChannel = async (username: string) => {
    if (!isCurrent()) return;
    const cacheKey = settingsCacheKey();
    setIsScraping(true);
    showToast(t("runtime.channels.fetching", { username }));
    try {
      const response = await fetch("/api/fetch-posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          usernames: [username],
        }),
      });

      if (!response.ok) {
        throw new Error(t("runtime.channels.serverFetchFailed"));
      }

      const data = await safeResponseJson(response);
      if (!isCurrent()) return;

      setSettings(prev => ({
        ...prev,
        channels: data.channels,
        posts: data.posts,
      }));

      localStorage.setItem(
        cacheKey,
        JSON.stringify({
          ...settings,
          channels: data.channels,
          posts: data.posts,
        })
      );

      showToast(t("runtime.channels.fetched", { username }));
    } catch (err: any) {
      if (!isCurrent()) return;
      console.error(err);
      showToast(t("runtime.channels.fetchFailed", { username, error: err.message }), "error");
    } finally {
      if (isCurrent()) setIsScraping(false);
    }
  };

  const handleFetchAll = async () => {
    if (!isCurrent()) return;
    const cacheKey = settingsCacheKey();
    setIsScraping(true);
    showToast(t("runtime.channels.allFetching"));
    try {
      const response = await fetch("/api/fetch-posts", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${authToken}`,
  },
  body: JSON.stringify({
    usernames: settings.channels.map(c => c.username)
  })
});

      if (!response.ok) {
        throw new Error(t("runtime.channels.serverFetchAllFailed"));
      }

      const data = await safeResponseJson(response);
      if (!isCurrent()) return;
      setSettings(prev => ({
        ...prev,
        channels: data.channels,
        posts: data.posts
      }));

      // Persist latest state
      localStorage.setItem(cacheKey, JSON.stringify({
        ...settings,
        channels: data.channels,
        posts: data.posts
      }));

      showToast(t("runtime.channels.allFetched", { count: data.fetchedCount, formattedCount: numberFormatter.format(data.fetchedCount) }));
    } catch (err: any) {
      if (!isCurrent()) return;
      console.error(err);
      showToast(t("runtime.channels.allFailed", { error: err.message }), "error");
    } finally {
      if (isCurrent()) setIsScraping(false);
    }
  };

  // 6. Post to Telegram Bot dispatch
  const handlePostToTelegram = async (postId: string, text: string, photoUrl?: string): Promise<boolean> => {
    if (!isCurrent()) return false;
    let persistedErrorMessage = "";
    try {
      const res = await fetch("/api/post-telegram", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${authToken}`,
  },
  body: JSON.stringify({
    postId,
    text,
    photoUrl,
  }),
});

      const data = await safeResponseJson(res);
      if (!isCurrent()) return false;
      if (res.ok && data.success) {
        // Replace in state
        setSettings(prev => ({
          ...prev,
          posts: prev.posts.map(p => p.id === postId ? data.post : p),
          destination: { ...prev.destination, connected: true }
        }));
        showToast(t("runtime.publishing.success"));
        return true;
      } else {
        persistedErrorMessage =
          typeof data.error === "string" && data.error.trim()
            ? data.error.trim()
            : t("runtime.publishing.failed");
        const errorKey =
          typeof data.code === "string"
            ? PUBLISHING_ERROR_KEYS[data.code]
            : undefined;
        throw new Error(errorKey ? t(errorKey) : persistedErrorMessage);
      }
    } catch (err: any) {
      if (!isCurrent()) return false;
      console.error(err);
      const message = err?.message || t("runtime.publishing.failed");
      showToast(message, "error");

      // Keep backend/debug detail in post state while presenting localized UI copy.
      handleUpdatePost(postId, { errorMessage: persistedErrorMessage || message });
      return false;
    }
  };

  if (authChecking) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl">
          <RefreshCw className="mx-auto mb-4 h-10 w-10 animate-spin text-sky-500" aria-hidden="true" />
          <h2 className="font-display text-lg font-bold text-slate-800">{t("runtime.loading.sessionTitle")}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {t("runtime.loading.sessionDescription")}
          </p>
        </div>
      </div>
    );
  }

  if (passwordSet === false || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        <Header connected={settings.destination.connected} channelId={settings.destination.channelId} targets={settings.destination.targets} supabaseActive={settings.supabaseActive} currentUsername={currentUsername} currentUserRole={currentUserRole} />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Login passwordSet={!!passwordSet} onSuccess={handleLoginSuccess} />
        </main>
        <footer className="mt-8 border-t border-slate-200 bg-white py-5 text-center text-sm text-slate-500">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-3">
            <p>© 2026 TGReposter</p>
            <p>{t("runtime.footer.secureOperations")}</p>
          </div>
        </footer>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl">
          <RefreshCw className="mx-auto mb-4 h-10 w-10 animate-spin text-sky-500" aria-hidden="true" />
          <h2 className="font-display text-lg font-bold text-slate-800">{t("runtime.loading.workspaceTitle")}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {t("runtime.loading.workspaceDescription")}
          </p>
        </div>
      </div>
    );
  }

  const isBotConfigured = !!settings.destination.botTokenConfigured && (!!settings.destination.targets?.some(t => t.enabled) || !!settings.destination.channelId);

  return (
    <AppShell
      activeView={activeWorkspaceTab}
      connected={settings.destination.connected}
      currentUsername={currentUsername}
      currentUserRole={currentUserRole}
      onLogout={handleLogout}
      onNavigate={handleNavigate}
      targets={settings.destination.targets}
    >
      <div className="space-y-5">
        {successToast && (
          <div className="flex items-center gap-2.5 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-md" role="status">
            <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span dir="auto">{successToast}</span>
          </div>
        )}

        {errorMessage && (
          <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-sm text-rose-800 shadow-sm" role="alert">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" aria-hidden="true" />
            <div>
              <p className="font-bold">{t("runtime.notice")}</p>
              <p className="mt-0.5 leading-relaxed text-rose-700" dir="auto">{errorMessage}</p>
            </div>
          </div>
        )}

        {!isBotConfigured && (activeWorkspaceTab === "dashboard" || activeWorkspaceTab === "feed") ? (
          <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 shadow-xs">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
            <div>
              <p className="font-bold">{t("runtime.publishingSetup.title")}</p>
              <p className="mt-1 leading-relaxed text-amber-700">
                {t("runtime.publishingSetup.description")}
              </p>
              <button type="button" onClick={() => handleNavigate("destination")} className="mt-2 min-h-11 rounded-lg px-2 text-sm font-bold text-amber-800 underline underline-offset-4">
                {t("runtime.publishingSetup.action")}
              </button>
            </div>
          </div>
        ) : null}

        {activeWorkspaceTab === "dashboard" ? (
          <Dashboard settings={settings} onNavigate={handleNavigate} onSync={handleFetchAll} isSyncing={isScraping} />
        ) : null}

        {activeWorkspaceTab === "feed" || activeWorkspaceTab === "history" ? (
          <CurationFeed
            initialTab={activeWorkspaceTab === "history" ? "posted" : "pending"}
            mode={activeWorkspaceTab === "history" ? "history" : "review"}
            posts={settings.posts}
            onUpdatePost={handleUpdatePost}
            onPostToTelegram={handlePostToTelegram}
            isBotConfigured={isBotConfigured}
            onTriggerScrape={handleFetchAll}
            isScraping={isScraping}
            targets={settings.destination.targets}
          />
        ) : null}

        {activeWorkspaceTab === "channels" ? (
          <SourceChannelsConfig channels={settings.channels} onAddChannel={handleAddChannel} onRemoveChannel={handleRemoveChannel} onFetchChannel={handleFetchChannel} onFetchAll={handleFetchAll} isGlobalFetching={isScraping} />
        ) : null}

        {activeWorkspaceTab === "filters" ? (
          <FilterConfig filters={settings.filters} onUpdateFilters={handleUpdateFilters} />
        ) : null}

        {activeWorkspaceTab === "destination" ? (
          <DestinationConfig destination={settings.destination} onSave={handleSaveDestination} />
        ) : null}

        {activeWorkspaceTab === "ai" ? (
          <AIConfigView
            aiConfig={settings.aiConfig}
            onUpdateAI={handleUpdateAI}
            onCredentialStatusChange={(provider, configured) => {
              if (provider === "gemini") {
                setGeminiActive(configured);
              } else {
                setOpenrouterActive(configured);
              }
            }}
            geminiActive={geminiActive}
            openrouterActive={openrouterActive}
          />
        ) : null}

        {activeWorkspaceTab === "database" && currentUserRole === "super-admin" ? <DatabaseConfig /> : null}

        {activeWorkspaceTab === "team" && currentUserRole === "super-admin" ? (
          <UserManagement users={settings.users || []} onAddUser={handleAddUser} onDeleteUser={handleDeleteUser} currentUsername={currentUsername} />
        ) : null}
      </div>
    </AppShell>
  );
}
