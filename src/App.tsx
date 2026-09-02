import { useState, useEffect } from "react";
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

const superAdminViews = new Set<WorkspaceView>(["channels", "filters", "ai", "team", "database"]);

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
  const username = localStorage.getItem("curator_username")?.trim().toLowerCase();
  return `telegram-curator-settings:${username || "anonymous"}`;
}

function initialWorkspaceView(): WorkspaceView {
  const stored = sessionStorage.getItem("tgreposter-active-view") as WorkspaceView | null;
  const validViews: WorkspaceView[] = ["dashboard", "feed", "history", "channels", "filters", "destination", "ai", "team", "database"];
  return stored && validViews.includes(stored) ? stored : "dashboard";
}

export default function App() {
  const [settings, setSettings] = useState<CuratorSettings>({
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
      connected: false
    },
    posts: [],
    users: []
  });

  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceView>(initialWorkspaceView);
  const [isLoading, setIsLoading] = useState(true);
  const [isScraping, setIsScraping] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successToast, setSuccessToast] = useState("");
  const [geminiActive, setGeminiActive] = useState(false);
  const [openrouterActive, setOpenrouterActive] = useState(false);

  // Authentication State
  const [authToken, setAuthToken] = useState<string | null>(localStorage.getItem("curator_token"));
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

  // Authentication validation helper
  const checkAuth = async (tokenToCheck: string | null) => {
    try {
      const res = await fetch("/api/auth/status", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    token: tokenToCheck
  })
});
      const data = await safeResponseJson(res);
      setPasswordSet(data.passwordSet);
      if (data.authenticated && tokenToCheck) {
        setIsAuthenticated(true);
        setAuthToken(tokenToCheck);
        setCurrentUserRole(data.role);
        setCurrentUsername(data.username);
        localStorage.setItem("curator_role", data.role || "");
        localStorage.setItem("curator_username", data.username || "");
        return true;
      } else {
        setIsAuthenticated(false);
        setAuthToken(null);
        setCurrentUserRole(null);
        setCurrentUsername(null);
        localStorage.removeItem("curator_role");
        localStorage.removeItem("curator_username");
        if (data.passwordSet) {
          localStorage.removeItem("curator_token");
        }
        return false;
      }
    } catch (e) {
      console.error("Auth status verification failed:", e);
      return false;
    } finally {
      setAuthChecking(false);
    }
  };

  const loadSettings = async (token?: string | null) => {
    setIsLoading(true);
    const activeToken = token !== undefined ? token : authToken;
    try {
      const response = await fetch("/api/settings", {
        headers: {
          ...(activeToken ? { "Authorization": `Bearer ${activeToken}` } : {})
        }
      });
      if (response.status === 401) {
        setIsAuthenticated(false);
        setIsLoading(false);
        return;
      }
      if (!response.ok) {
        throw new Error("Failed to load settings from server");
      }
      const data = await safeResponseJson(response);
      const safeData = sanitizeClientSettings(data);
      setSettings(safeData);
      localStorage.setItem(settingsCacheKey(), JSON.stringify(safeData));
      setPasswordSet(data.passwordSet);
      setGeminiActive(!!data.geminiActive);
      setOpenrouterActive(!!data.openrouterActive);
      if (data.passwordSet && activeToken) {
        setIsAuthenticated(true);
      }
    } catch (err: any) {
      console.error("Error loading configuration:", err);
      // Fallback to client localStorage if server is temporarily unreachable
      const local = localStorage.getItem(settingsCacheKey());
      if (local) {
        try {
          const safeLocal = sanitizeClientSettings(JSON.parse(local));
          setSettings(safeLocal);
          localStorage.setItem(settingsCacheKey(), JSON.stringify(safeLocal));
        } catch (_) {}
      }
      setErrorMessage("Unable to fetch settings from server. Reverting to local cache.");
    } finally {
      setIsLoading(false);
    }
  };

  // Perform security checks & configuration loads on mount
  useEffect(() => {
    const savedToken = localStorage.getItem("curator_token");
    checkAuth(savedToken).then((authenticated) => {
      // If authenticated, or if no master password has been set up yet, read settings.
      // If we need authentication, the loader stops and redirects to login layout.
      if (authenticated) {
        loadSettings(savedToken);
      } else {
        // Query again to verify if we can proceed passwordless or if we must gate
        fetch("/api/auth/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: null })
        })
        .then(r => safeResponseJson(r))
        .then(data => {
          setPasswordSet(data.passwordSet);
          if (!data.passwordSet) {
            // Bypass login since no password exists yet
            loadSettings(null);
          } else {
            setIsLoading(false);
          }
        })
        .catch(() => {
          setIsLoading(false);
        });
      }
    });
  }, []);

  // Generic authenticated fetch helper
  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    const savedToken = localStorage.getItem("curator_token");
    const headers = {
      ...options.headers,
      "Content-Type": "application/json",
      ...(savedToken ? { "Authorization": `Bearer ${savedToken}` } : {})
    };
    return fetch(url, { ...options, headers });
  };

  // Save settings helper
  const saveSettingsToServer = async (updated: CuratorSettings) => {
    const safeUpdated = sanitizeClientSettings(updated);

    // Keep a token-free local fallback only.
    localStorage.setItem(settingsCacheKey(), JSON.stringify(safeUpdated));
    setSettings(safeUpdated);

    try {
      const response = await fetchWithAuth("/api/settings", {
        method: "POST",
        body: JSON.stringify(safeUpdated)
      });
      if (!response.ok) {
        throw new Error("Failed to save settings on server");
      }
      const data = await safeResponseJson(response);
      const safeData = sanitizeClientSettings(data);
      setSettings(safeData);
      localStorage.setItem(settingsCacheKey(), JSON.stringify(safeData));
      setPasswordSet(data.passwordSet);
      setGeminiActive(!!data.geminiActive);
      setOpenrouterActive(!!data.openrouterActive);
    } catch (err: any) {
      console.error("Error saving configuration:", err);
      showToast("Config saved locally, but server failed to persist.", "error");
    }
  };

  const handleLoginSuccess = (token: string, isNewSetup: boolean, role: 'super-admin' | 'admin', username: string) => {
    localStorage.setItem("curator_token", token);
    localStorage.setItem("curator_role", role);
    localStorage.setItem("curator_username", username);
    setAuthToken(token);
    setCurrentUserRole(role);
    setCurrentUsername(username);
    setIsAuthenticated(true);
    setPasswordSet(true);
    showToast(isNewSetup ? "Super-admin account set! Workspace unlocked." : `Welcome, ${username}! Workspace unlocked.`);
    loadSettings(token);
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: authToken })
      });
    } catch (e) {
      console.error("Logout notification failed:", e);
    }
    localStorage.removeItem("curator_token");
    localStorage.removeItem("curator_role");
    localStorage.removeItem("curator_username");
    setAuthToken(null);
    setCurrentUserRole(null);
    setCurrentUsername(null);
    setIsAuthenticated(false);
    showToast("Workspace locked.");
  };

  const handleAddUser = async (username: string, password: string, role: "super-admin" | "admin"): Promise<boolean> => {
    try {
      const response = await fetchWithAuth("/api/users/add", {
        method: "POST",
        body: JSON.stringify({ username, password, role })
      });
      if (!response.ok) {
        const data = await safeResponseJson(response);
        throw new Error(data.error || "Failed to add user");
      }
      const data = await safeResponseJson(response);
      setSettings(prev => ({ ...prev, users: data.users }));
      showToast(`User "${username}" successfully registered.`);
      return true;
    } catch (err: any) {
      showToast(err.message || "Unable to add user", "error");
      return false;
    }
  };

  const handleDeleteUser = async (username: string): Promise<boolean> => {
    try {
      const response = await fetchWithAuth("/api/users/delete", {
        method: "POST",
        body: JSON.stringify({ username })
      });
      if (!response.ok) {
        const data = await safeResponseJson(response);
        throw new Error(data.error || "Failed to revoke user access");
      }
      const data = await safeResponseJson(response);
      setSettings(prev => ({ ...prev, users: data.users }));
      showToast(`User "${username}" access revoked.`);
      return true;
    } catch (err: any) {
      showToast(err.message || "Unable to revoke user access", "error");
      return false;
    }
  };

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    if (type === "success") {
      setSuccessToast(msg);
      setTimeout(() => setSuccessToast(""), 4000);
    } else {
      setErrorMessage(msg);
      setTimeout(() => setErrorMessage(""), 5000);
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
    const cleanUsername = username.trim().toLowerCase();
    const updatedChannels = [...settings.channels, { username: cleanUsername, status: "idle" as const }];
    const updated = { ...settings, channels: updatedChannels };
    await saveSettingsToServer(updated);
    showToast(`Added channel @${cleanUsername}! Automatically fetching posts...`);
    // Auto fetch the newly added channel
    handleFetchChannel(cleanUsername);
  };

  const handleRemoveChannel = async (username: string) => {
    const updatedChannels = settings.channels.filter(c => c.username !== username);
    const updated = { ...settings, channels: updatedChannels };
    await saveSettingsToServer(updated);
    showToast(`Removed channel @${username}`);
  };

  // 2. Filter actions
  const handleUpdateFilters = async (updatedFilters: IFilterConfig) => {
    const updated = { ...settings, filters: updatedFilters };
    await saveSettingsToServer(updated);
    showToast("Filtering criteria updated successfully.");
  };

  // 3. Destination configuration actions
  const handleSaveDestination = async (botToken: string, targets: DestinationTarget[]): Promise<boolean> => {
    let botTokenConfigured = !!settings.destination.botTokenConfigured;

    if (botToken.trim()) {
      try {
        const tokenResponse = await fetchWithAuth("/api/destination/bot-token", {
          method: "POST",
          body: JSON.stringify({ botToken: botToken.trim() }),
        });
        const tokenResult = await safeResponseJson(tokenResponse);

        if (!tokenResponse.ok || !tokenResult.success) {
          throw new Error(tokenResult.error || "Unable to store Telegram bot token.");
        }

        botTokenConfigured = true;
      } catch (err: any) {
        showToast(err?.message || "Unable to store Telegram bot token.", "error");
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
    await saveSettingsToServer(updated);
    showToast(botToken.trim() ? "Telegram bot token stored securely and destinations updated." : "Telegram destinations updated.");
    return true;
  };

  const handleUpdateAI = async (updatedAI: IAIConfig) => {
    const updated = { ...settings, aiConfig: updatedAI };
    await saveSettingsToServer(updated);
    showToast("AI configuration updated successfully.");
  };

  // 4. Manual Post Tweaks or status changes
  const handleUpdatePost = async (postId: string, updatedFields: Partial<CuratedPost>) => {
    const updatedPosts = settings.posts.map(post => {
      if (post.id === postId) {
        return { ...post, ...updatedFields };
      }
      return post;
    });
    const updated = { ...settings, posts: updatedPosts };
    await saveSettingsToServer(updated);
  };

  // 5. Scraper triggers
  const handleFetchChannel = async (username: string) => {
    setIsScraping(true);
    showToast(`Fetching feed for @${username}...`);
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
    throw new Error("Server failed to scrape channel.");
  }

  const data = await safeResponseJson(response);

  setSettings(prev => ({
    ...prev,
    channels: data.channels,
    posts: data.posts,
  }));

  localStorage.setItem(
    settingsCacheKey(),
    JSON.stringify({
      ...settings,
      channels: data.channels,
      posts: data.posts,
    })
  );

  showToast(`Scrape completed! Collected posts for @${username}.`);
    } catch (err: any) {
      console.error(err);
      showToast(`Scrape failed for @${username}: ${err.message}`, "error");
    } finally {
      setIsScraping(false);
    }
  };

  const handleFetchAll = async () => {
    setIsScraping(true);
    showToast("Initiating scraping for all target feeds...");
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
        throw new Error("Server failed to scrape channels.");
      }

      const data = await safeResponseJson(response);
      setSettings(prev => ({
        ...prev,
        channels: data.channels,
        posts: data.posts
      }));

      // Persist latest state
      localStorage.setItem(settingsCacheKey(), JSON.stringify({
        ...settings,
        channels: data.channels,
        posts: data.posts
      }));

      showToast(`Feed scrape complete! Found ${data.fetchedCount} new posts matching rules.`);
    } catch (err: any) {
      console.error(err);
      showToast(`Scrape error: ${err.message}`, "error");
    } finally {
      setIsScraping(false);
    }
  };

  // 6. Post to Telegram Bot dispatch
  const handlePostToTelegram = async (postId: string, text: string, photoUrl?: string): Promise<boolean> => {
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
      if (res.ok && data.success) {
        // Replace in state
        setSettings(prev => ({
          ...prev,
          posts: prev.posts.map(p => p.id === postId ? data.post : p),
          destination: { ...prev.destination, connected: true }
        }));
        showToast("Post dispatched successfully to your channel!");
        return true;
      } else {
        throw new Error(data.error || "Telegram failed to post message.");
      }
    } catch (err: any) {
      console.error(err);
      showToast(`Telegram Bot Error: ${err.message}`, "error");
      
      // Update error state locally on post
      handleUpdatePost(postId, { errorMessage: err.message });
      return false;
    }
  };

  if (authChecking) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl">
          <RefreshCw className="mx-auto mb-4 h-10 w-10 animate-spin text-sky-500" aria-hidden="true" />
          <h2 className="font-display text-lg font-bold text-slate-800">Checking your session</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            TGReposter is securely verifying your access.
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
            <p>Secure Telegram content operations</p>
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
          <h2 className="font-display text-lg font-bold text-slate-800">Opening your workspace</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Loading sources, posts, destinations, and publishing status.
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
            <span>{successToast}</span>
          </div>
        )}

        {errorMessage && (
          <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-sm text-rose-800 shadow-sm" role="alert">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" aria-hidden="true" />
            <div>
              <p className="font-bold">Notice</p>
              <p className="mt-0.5 leading-relaxed text-rose-700">{errorMessage}</p>
            </div>
          </div>
        )}

        {!isBotConfigured && (activeWorkspaceTab === "dashboard" || activeWorkspaceTab === "feed") ? (
          <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 shadow-xs">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
            <div>
              <p className="font-bold">Publishing setup required</p>
              <p className="mt-1 leading-relaxed text-amber-700">
                Content collection and editing are available. Configure and enable a Telegram destination before publishing.
              </p>
              <button type="button" onClick={() => handleNavigate("destination")} className="mt-2 min-h-11 rounded-lg px-2 text-sm font-bold text-amber-800 underline underline-offset-4">
                Configure my destinations
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
            posts={settings.posts}
            onUpdatePost={handleUpdatePost}
            onPostToTelegram={handlePostToTelegram}
            isBotConfigured={isBotConfigured}
            onTriggerScrape={handleFetchAll}
            isScraping={isScraping}
            targets={settings.destination.targets}
          />
        ) : null}

        {activeWorkspaceTab === "channels" && currentUserRole === "super-admin" ? (
          <SourceChannelsConfig channels={settings.channels} onAddChannel={handleAddChannel} onRemoveChannel={handleRemoveChannel} onFetchChannel={handleFetchChannel} onFetchAll={handleFetchAll} isGlobalFetching={isScraping} />
        ) : null}

        {activeWorkspaceTab === "filters" && currentUserRole === "super-admin" ? (
          <FilterConfig filters={settings.filters} onUpdateFilters={handleUpdateFilters} />
        ) : null}

        {activeWorkspaceTab === "destination" ? (
          <DestinationConfig destination={settings.destination} onSave={handleSaveDestination} />
        ) : null}

        {activeWorkspaceTab === "ai" && currentUserRole === "super-admin" ? (
          <AIConfigView aiConfig={settings.aiConfig} onUpdateAI={handleUpdateAI} geminiActive={geminiActive} openrouterActive={openrouterActive} />
        ) : null}

        {activeWorkspaceTab === "database" && currentUserRole === "super-admin" ? <DatabaseConfig /> : null}

        {activeWorkspaceTab === "team" && currentUserRole === "super-admin" ? (
          <UserManagement users={settings.users || []} onAddUser={handleAddUser} onDeleteUser={handleDeleteUser} currentUsername={currentUsername} />
        ) : null}
      </div>
    </AppShell>
  );
}
