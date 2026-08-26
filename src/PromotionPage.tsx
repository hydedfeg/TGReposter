import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import Header from "./components/Header";
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
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Header
        connected={settings.destination.connected}
        channelId={settings.destination.channelId}
        targets={settings.destination.targets}
        onLogout={handleLogout}
        supabaseActive={settings.supabaseActive}
        currentUsername={currentUsername}
        currentUserRole={currentUserRole}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-5">
        {successToast && (
          <div className="bg-emerald-500 text-white rounded-xl py-3 px-4 shadow-md text-sm font-semibold">
            {successToast}
          </div>
        )}
        {errorMessage && (
          <div className="bg-rose-50 border border-rose-100 text-rose-800 rounded-xl py-3.5 px-4 shadow-sm text-sm">
            <p className="font-bold">Notice</p>
            <p className="text-xs text-rose-700 mt-0.5">{errorMessage}</p>
          </div>
        )}

        <PromotionCenter
          posts={settings.posts || []}
          currentUserRole={currentUserRole}
          onToast={showToast}
        />
      </main>

      <footer className="bg-white border-t border-slate-200 py-6 mt-12 text-center text-slate-400 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-3">
          <p>© 2026 Telegram Content Curator. Promotion campaigns use server-owned Telegram credentials and AI provider keys.</p>
          <p className="font-mono text-[10px]">AI output requires human review before campaign publishing</p>
        </div>
      </footer>
    </div>
  );
}
