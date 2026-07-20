import { useState, useEffect } from "react";
import {
  Send,
  Radio,
  Filter,
  Bot,
  MessageSquare,
  RefreshCw,
  AlertTriangle,
  Sparkles,
  Info,
  LogOut,
  Database,
  Users
} from "lucide-react";
import Header from "./components/Header";
import SourceChannelsConfig from "./components/SourceChannelsConfig";
import FilterConfig from "./components/FilterConfig";
import DestinationConfig from "./components/DestinationConfig";
import CurationFeed from "./components/CurationFeed";
import DatabaseConfig from "./components/DatabaseConfig";
import AIConfigView from "./components/AIConfig";
import Login from "./components/Login";
import UserManagement from "./components/UserManagement";
import { SourceChannel, FilterConfig as IFilterConfig, DestinationConfig as IDestinationConfig, DestinationTarget, CuratedPost, CuratorSettings, AIConfig as IAIConfig } from "./types";
import { safeResponseJson } from "./utils/api";

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

  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<"feed" | "channels" | "filters" | "destination" | "database" | "ai" | "team">("feed");
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
      setSettings(data);
      setPasswordSet(data.passwordSet);
      setGeminiActive(!!data.geminiActive);
      setOpenrouterActive(!!data.openrouterActive);
      if (data.passwordSet && activeToken) {
        setIsAuthenticated(true);
      }
    } catch (err: any) {
      console.error("Error loading configuration:", err);
      // Fallback to client localStorage if server is temporarily unreachable
      const local = localStorage.getItem("telegram-curator-settings");
      if (local) {
        try {
          setSettings(JSON.parse(local));
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
    // Back up in localStorage
    localStorage.setItem("telegram-curator-settings", JSON.stringify(updated));
    setSettings(updated);

    try {
      const response = await fetchWithAuth("/api/settings", {
        method: "POST",
        body: JSON.stringify(updated)
      });
      if (!response.ok) {
        throw new Error("Failed to save settings on server");
      }
      const data = await safeResponseJson(response);
      setSettings(data);
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
    const updatedDestination: IDestinationConfig = {
      ...settings.destination,
      botToken,
      targets,
      connected: true
    };
    const updated = { ...settings, destination: updatedDestination };
    await saveSettingsToServer(updated);
    showToast("Telegram Destination Bot and targets updated.");
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
    "telegram-curator-settings",
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
      localStorage.setItem("telegram-curator-settings", JSON.stringify({
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
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center py-12">
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-xl max-w-sm text-center">
          <RefreshCw className="w-10 h-10 text-sky-500 animate-spin mx-auto mb-4" />
          <h2 className="font-display font-bold text-slate-800 text-lg">Verifying Access Gatekeeper</h2>
          <p className="text-slate-500 text-xs mt-1 leading-relaxed">
            Please wait while we verify security policies and authenticate your session credentials...
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
        <footer className="bg-white border-t border-slate-200 py-6 mt-12 text-center text-slate-400 text-xs">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-3">
            <p>© 2026 Telegram Content Curator. Powered by server-side Gemini 3.5 Flash.</p>
            <p className="font-mono text-[10px]">Secure, localized server storage • V1.0.0</p>
          </div>
        </footer>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center py-12">
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-xl max-w-sm text-center">
          <RefreshCw className="w-10 h-10 text-sky-500 animate-spin mx-auto mb-4" />
          <h2 className="font-display font-bold text-slate-800 text-lg">Initializing Curator Workspace</h2>
          <p className="text-slate-500 text-xs mt-1 leading-relaxed">
            Please wait while we boot up the background scraping server and establish initial configurations...
          </p>
        </div>
      </div>
    );
  }

  const isBotConfigured = !!settings.destination.botToken && (!!settings.destination.targets?.some(t => t.enabled) || !!settings.destination.channelId);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Header connected={settings.destination.connected} channelId={settings.destination.channelId} targets={settings.destination.targets} onLogout={handleLogout} supabaseActive={settings.supabaseActive} currentUsername={currentUsername} currentUserRole={currentUserRole} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        
        {/* Toast / Banner Messages */}
        {successToast && (
          <div className="bg-emerald-500 text-white rounded-xl py-3 px-4 shadow-md flex items-center gap-2.5 animate-fadeIn transition-all text-sm font-semibold">
            <CheckCircleIcon className="w-5 h-5 shrink-0" />
            <span>{successToast}</span>
          </div>
        )}

        {errorMessage && (
          <div className="bg-rose-50 border border-rose-100 text-rose-800 rounded-xl py-3.5 px-4 shadow-sm flex items-start gap-2.5 animate-fadeIn text-sm">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Notice</p>
              <p className="text-xs text-rose-700/90 mt-0.5 leading-relaxed font-sans">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Global Action Tip if bot not set up */}
        {!isBotConfigured && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-sm text-amber-800 shadow-3xs">
            <Info className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Bot Configuration Required</p>
              <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                You haven't configured an active Telegram target yet! You can still scrape source channels and edit posts using Gemini, but to publish them directly, go to the <b>Destination Bot</b> workspace tab, supply bot credentials, and activate at least one channel or group.
              </p>
            </div>
          </div>
        )}

        {/* Workspace Navigation Links */}
        <div className="bg-white border border-slate-200 rounded-xl p-2.5 shadow-3xs flex flex-wrap gap-1">
          <button
            onClick={() => setActiveWorkspaceTab("feed")}
            className={`flex-1 min-w-[120px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeWorkspaceTab === "feed"
                ? "bg-slate-900 text-white shadow-2xs"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            Curation Workspace
          </button>

          <button
            onClick={() => setActiveWorkspaceTab("channels")}
            className={`flex-1 min-w-[120px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeWorkspaceTab === "channels"
                ? "bg-slate-900 text-white shadow-2xs"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Radio className="w-4 h-4" />
            Source Feeds
          </button>

          <button
            onClick={() => setActiveWorkspaceTab("filters")}
            className={`flex-1 min-w-[120px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeWorkspaceTab === "filters"
                ? "bg-slate-900 text-white shadow-2xs"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Filter className="w-4 h-4" />
            Keyword Filters
          </button>

          <button
            onClick={() => setActiveWorkspaceTab("destination")}
            className={`flex-1 min-w-[120px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeWorkspaceTab === "destination"
                ? "bg-slate-900 text-white shadow-2xs"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Bot className="w-4 h-4" />
            Destination Bot
          </button>

          <button
            onClick={() => setActiveWorkspaceTab("ai")}
            className={`flex-1 min-w-[120px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeWorkspaceTab === "ai"
                ? "bg-slate-900 text-white shadow-2xs"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Sparkles className="w-4 h-4" />
            AI Engine
          </button>

          {currentUserRole === "super-admin" && (
            <button
              onClick={() => setActiveWorkspaceTab("database")}
              className={`flex-1 min-w-[120px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeWorkspaceTab === "database"
                  ? "bg-slate-900 text-white shadow-2xs"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Database className="w-4 h-4" />
              Supabase Sync
            </button>
          )}

          {currentUserRole === "super-admin" && (
            <button
              onClick={() => setActiveWorkspaceTab("team")}
              className={`flex-1 min-w-[120px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeWorkspaceTab === "team"
                  ? "bg-slate-900 text-white shadow-2xs"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Users className="w-4 h-4" />
              Team Admins
            </button>
          )}
        </div>

        {/* Workspace Panels */}
        <div className="transition-all duration-300">
          {currentUserRole !== "super-admin" && activeWorkspaceTab !== "feed" && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-xs flex gap-2.5 items-start mb-4 animate-fadeIn">
              <span className="font-bold bg-amber-200 text-amber-950 px-2 py-0.5 rounded-sm uppercase text-[9px] shrink-0 mt-0.5">Read-Only</span>
              <div>
                <p className="font-bold">System Configuration Locked</p>
                <p className="text-amber-700 mt-0.5 leading-normal">
                  You are viewing this screen in read-only mode. Adding, deleting, or editing scrapers, keywords, and bot connections is reserved exclusively for the <b>Super-Admin</b> (System Owner).
                </p>
              </div>
            </div>
          )}

          {activeWorkspaceTab === "feed" && (
            <CurationFeed
              posts={settings.posts}
              onUpdatePost={handleUpdatePost}
              onPostToTelegram={handlePostToTelegram}
              isBotConfigured={isBotConfigured}
              onTriggerScrape={handleFetchAll}
              isScraping={isScraping}
              targets={settings.destination.targets}
            />
          )}

          {activeWorkspaceTab === "channels" && (
            <SourceChannelsConfig
              channels={settings.channels}
              onAddChannel={handleAddChannel}
              onRemoveChannel={handleRemoveChannel}
              onFetchChannel={handleFetchChannel}
              onFetchAll={handleFetchAll}
              isGlobalFetching={isScraping}
              readOnly={currentUserRole !== "super-admin"}
            />
          )}

          {activeWorkspaceTab === "filters" && (
            <FilterConfig
              filters={settings.filters}
              onUpdateFilters={handleUpdateFilters}
              readOnly={currentUserRole !== "super-admin"}
            />
          )}

          {activeWorkspaceTab === "destination" && (
            <DestinationConfig
              destination={settings.destination}
              onSave={handleSaveDestination}
              readOnly={currentUserRole !== "super-admin"}
            />
          )}

          {activeWorkspaceTab === "ai" && (
            <AIConfigView
              aiConfig={settings.aiConfig}
              onUpdateAI={handleUpdateAI}
              geminiActive={geminiActive}
              openrouterActive={openrouterActive}
              readOnly={currentUserRole !== "super-admin"}
            />
          )}

          {activeWorkspaceTab === "database" && currentUserRole === "super-admin" && (
            <DatabaseConfig />
          )}

          {activeWorkspaceTab === "team" && currentUserRole === "super-admin" && (
            <UserManagement
              users={settings.users || []}
              onAddUser={handleAddUser}
              onDeleteUser={handleDeleteUser}
              currentUsername={currentUsername}
            />
          )}
        </div>
      </main>

      <footer className="bg-white border-t border-slate-200 py-6 mt-12 text-center text-slate-400 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-3">
          <p>© 2026 Telegram Content Curator. Powered by server-side Gemini 3.5 Flash.</p>
          <p className="font-mono text-[10px]">Secure, localized server storage • V1.0.0</p>
        </div>
      </footer>
    </div>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
