import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import AppShell, { type WorkspaceView } from "./components/AppShell";
import PromotionCenter from "./components/PromotionCenter";
import type { CuratorSettings } from "./types";
import { safeResponseJson } from "./utils/api";

type UserRole = "super-admin" | "admin" | null;

export default function PromotionPage() {
  const [settings, setSettings] = useState<CuratorSettings | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);
  const [successToast, setSuccessToast] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const showToast = (message: string, type: "success" | "error" = "success") => {
    if (type === "success") {
      setSuccessToast(message);
      setTimeout(() => setSuccessToast(""), 4000);
    } else {
      setErrorMessage(message);
      setTimeout(() => setErrorMessage(""), 5000);
    }
  };

  const load = async () => {
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
      if (!authData.authenticated) {
        localStorage.removeItem("curator_token");
        localStorage.removeItem("curator_role");
        localStorage.removeItem("curator_username");
        window.location.hash = "";
        return;
      }

      setCurrentUsername(authData.username || null);
      setCurrentUserRole(authData.role || null);

      const settingsResponse = await fetch("/api/settings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const settingsData = await safeResponseJson(settingsResponse);
      if (!settingsResponse.ok) throw new Error(settingsData.error || "Unable to load curator settings.");
      setSettings(settingsData);
    } catch (error: any) {
      setErrorMessage(error.message || "Unable to initialize Promotion Center.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleLogout = async () => {
    const token = localStorage.getItem("curator_token");
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
    } catch (_) {}
    localStorage.removeItem("curator_token");
    localStorage.removeItem("curator_role");
    localStorage.removeItem("curator_username");
    window.location.hash = "";
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
