import { Send, Sparkles, CheckCircle2, AlertCircle, LogOut, Database } from "lucide-react";
import { DestinationTarget } from "../types";

interface HeaderProps {
  connected: boolean;
  channelId?: string;
  targets?: DestinationTarget[];
  onLogout?: () => void;
  supabaseActive?: boolean;
}

export default function Header({ connected, channelId, targets, onLogout, supabaseActive }: HeaderProps) {
  const activeTargetsCount = targets ? targets.filter(t => t.enabled).length : 0;
  
  let statusDetail = "Configure in Destination tab";
  if (connected) {
    if (activeTargetsCount > 0) {
      statusDetail = `${activeTargetsCount} Active Target${activeTargetsCount > 1 ? "s" : ""}`;
    } else if (channelId) {
      statusDetail = channelId;
    } else {
      statusDetail = "No targets enabled";
    }
  }

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-sky-500 to-blue-600 p-2.5 rounded-xl shadow-md text-white flex items-center justify-center">
            <Send className="w-6 h-6 transform -rotate-12 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-bold text-2xl tracking-tight text-slate-900">
                Telegram Content Curator
              </h1>
              <span className="inline-flex items-center gap-1 bg-sky-50 text-sky-700 text-xs px-2.5 py-0.5 rounded-full font-medium font-sans">
                <Sparkles className="w-3.5 h-3.5" /> Gemini 3.5 Powered
              </span>
            </div>
            <p className="text-slate-500 text-sm mt-0.5 font-sans">
              Scrape public Telegram feeds, filter with precision, and curate with artificial intelligence.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {connected ? (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-lg text-emerald-800 text-xs font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <div>
                <p className="font-semibold leading-none">Bot Connected</p>
                <p className="text-[10px] text-emerald-600 font-mono mt-0.5">{statusDetail}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-lg text-amber-800 text-xs font-medium">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
              <div>
                <p className="font-semibold leading-none">Bot Unconfigured</p>
                <p className="text-[10px] text-amber-600 mt-0.5">{statusDetail}</p>
              </div>
            </div>
          )}

          {supabaseActive ? (
            <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-lg text-indigo-800 text-xs font-medium" title="Supabase Cloud PostgreSQL Active">
              <Database className="w-4 h-4 text-indigo-500 shrink-0" />
              <div className="hidden sm:block">
                <p className="font-semibold leading-none">Supabase DB</p>
                <p className="text-[10px] text-indigo-500 font-mono mt-0.5">Cloud Live</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg text-slate-700 text-xs font-medium" title="Storing data locally in JSON file. Define SUPABASE_URL and SUPABASE_ANON_KEY to connect to Supabase.">
              <Database className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="hidden sm:block">
                <p className="font-semibold leading-none">Local JSON</p>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">Server File</p>
              </div>
            </div>
          )}

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer transition-colors"
              title="Lock Curator Workspace"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="font-semibold">Lock</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
