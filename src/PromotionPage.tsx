import { useEffect, useState, useRef } from "react";
import { Loader2 } from "lucide-react";
import AppShell, { type WorkspaceView } from "./components/AppShell";
import PromotionCenter from "./components/PromotionCenter";
import type { CuratorSettings } from "./types";
import { safeResponseJson } from "./utils/api";

import { WorkspaceSession } from "./utils/workspaceSession";

type UserRole = "super-admin" | "admin" | null;

export default function PromotionPage() {
  const session = useRef(new WorkspaceSession()).current;
  const sessionToken = useRef(localStorage.getItem("curator_token")).current;
  const isCurrent = session.capture(sessionToken);
  const [settings, setSettings] = useState<CuratorSettings | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);
  const [successToast, setSuccessToast] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const showToast = (message: string, type: "success" | "error" = "success") => {
    if (!isCurrent()) return;
    if (type === "success") {
      setSuccessToast(message);
      setTimeout(() => { if (isCurrent()) setSuccessToast(""); }, 4000);
    } else {
      setErrorMessage(message);
      setTimeout(() => { if (isCurrent()) setErrorMessage(""); }, 5000);
    }
  };

  const load = async (current: () => boolean) => {
    const token = localStorage.getItem("curator_token");
    if (!token) {
      window.location.hash = "";
      return;
    }

    try {
      const authResponse = await fetch("/api/auth/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const authData = await safeResponseJson(authResponse);
      if (!current()) return;
      if (!authData.authenticated) {
        const accountKey = localStorage.getItem("curator_account_key")?.trim().toLowerCase();
        if (accountKey) {
          localStorage.removeItem(`telegram-curator-settings:${accountKey}`);
        }
        localStorage.removeItem("curator_token");
        localStorage.removeItem("curator_role");
        localStorage.removeItem("curator_username");
        localStorage.removeItem("curator_account_key");
        window.location.hash = "";
        return;
      }

      setCurrentUsername(authData.username || null);
      setCurrentUserRole(authData.role || null);
      localStorage.setItem("curator_account_key", authData.accountKey || "");

      const settingsResponse = await fetch("/api/settings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const settingsData = await safeResponseJson(settingsResponse);
      if (!current()) return;
      if (!settingsResponse.ok) throw new Error(settingsData.error || "Unable to load curator settings.");
      setSettings(settingsData);
    } catch (error: any) {
      if (!current()) return;
      setErrorMessage(error.message || "Unable to initialize Promotion Center.");
    } finally {
      if (current()) setLoading(false);
    }
  };

  useEffect(() => {
    load(session.capture(sessionToken));
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === "curator_token" || event.key === "curator_account_key") {
        session.invalidate();
        setSettings(null);
        window.location.hash = "";
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      session.invalidate();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const handleLogout = async () => {
    if (!isCurrent()) return;
    const token = localStorage.getItem("curator_token");
    const accountKey = localStorage.getItem("curator_account_key")?.trim().toLowerCase();
    if (accountKey) {
      localStorage.removeItem(`telegram-curator-settings:${accountKey}`);
    }
    localStorage.removeItem("curator_token");
    localStorage.removeItem("curator_role");
    localStorage.removeItem("curator_username");
    localStorage.removeItem("curator_account_key");
    session.invalidate();
    setSettings(null);
    setCurrentUsername(null);
    setCurrentUserRole(null);
    setSuccessToast("");
    setErrorMessage("");
    window.location.hash = "";
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
    } catch (_) {}
  };

  const handleNavigate = (view: WorkspaceView) => {
    if (view === "promotion") return;
    sessionStorage.setItem("tgreposter-active-view", view);
    window.location.hash = "";
  };

  if (loading || !settings) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-xl text-center max-w-sm">
          <Loader2 className="w-9 h-9 text-sky-500 animate-spin mx-auto" />
          <h2 className="font-display font-bold text-slate-800 text-lg mt-4">Opening Promotion Center</h2>
          <p className="text-xs text-slate-500 mt-1">Verifying your session and loading campaign data.</p>
          {errorMessage && <p className="text-xs text-rose-600 mt-4">{errorMessage}</p>}
        </div>
      </div>
    );
  }

  return (
    <AppShell
      activeView="promotion"
      connected={settings.destination.connected}
      currentUsername={currentUsername}
      currentUserRole={currentUserRole}
      onLogout={handleLogout}
      onNavigate={handleNavigate}
      targets={settings.destination.targets}
    >
      <div className="space-y-5">
        {successToast && (
          <div className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-md" role="status">
            {successToast}
          </div>
        )}
        {errorMessage && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-sm text-rose-800 shadow-sm" role="alert">
            <p className="font-bold">Notice</p>
            <p className="mt-0.5 text-rose-700">{errorMessage}</p>
          </div>
        )}

        <PromotionCenter posts={settings.posts || []} currentUserRole={currentUserRole} onToast={showToast} />
      </div>
    </AppShell>
  );
}
