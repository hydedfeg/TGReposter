import { CheckCircle2, LogOut, Megaphone, Send, ShieldCheck } from "lucide-react";
import type { DestinationTarget } from "../types";

interface HeaderProps {
  channelId?: string;
  connected: boolean;
  currentUsername?: string | null;
  currentUserRole?: "super-admin" | "admin" | null;
  onLogout?: () => void;
  supabaseActive?: boolean;
  targets?: DestinationTarget[];
}

export default function Header({ connected, currentUsername, currentUserRole, onLogout, targets }: HeaderProps) {
  const activeTargets = targets?.filter((target) => target.enabled).length || 0;

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500 text-white shadow-sm">
            <Send className="h-5 w-5 -rotate-12" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-xl font-bold tracking-tight text-slate-950">TGReposter</p>
            <p className="hidden text-sm text-slate-500 sm:block">AI Powered Telegram content operations</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {currentUsername ? (
            <div className="hidden min-h-10 items-center gap-2 rounded-xl bg-slate-100 px-3 text-sm font-semibold text-slate-700 sm:flex">
              <span>{currentUsername}</span>
              <span className="rounded-full bg-slate-950 px-2 py-0.5 text-xs font-bold text-white">{currentUserRole === "super-admin" ? "Owner" : "Admin"}</span>
            </div>
          ) : (
            <div className="hidden min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-600 sm:flex">
              <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Secure workspace
            </div>
          )}
          {connected && currentUsername ? (
            <div className="hidden min-h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 md:flex">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {activeTargets || 1} target{activeTargets === 1 ? "" : "s"} ready
            </div>
          ) : null}
          {currentUsername ? (
            <button
              type="button"
              onClick={() => { window.location.hash = "promotion"; }}
              aria-label="Open Promotion Center"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              <Megaphone className="h-5 w-5" aria-hidden="true" />
            </button>
          ) : null}
          {onLogout ? (
            <button type="button" onClick={onLogout} aria-label="Sign out" className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50">
              <LogOut className="h-5 w-5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
