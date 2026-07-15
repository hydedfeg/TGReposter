import React, { useState, useEffect } from "react";
import { Database, CheckCircle2, AlertTriangle, Copy, RefreshCw, PlayCircle, Terminal, ArrowRight, Check } from "lucide-react";
import { safeResponseJson } from "../utils/api";

interface DatabaseStatus {
  configured: boolean;
  hasDirectDbUrl: boolean;
  supabaseUrl: string;
  exists: boolean;
  error?: string;
  methodUsed: string;
}

export default function DatabaseConfig() {
  const [status, setStatus] = useState<DatabaseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ success: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/supabase/status", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("curator_token") || ""}`
        }
      });
      if (response.ok) {
        const data = await safeResponseJson(response);
        setStatus(data);
      } else {
        console.error("Failed to fetch database status");
      }
    } catch (err) {
      console.error("Error fetching database status:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleAutoCreate = async () => {
    setActionLoading(true);
    setActionMessage(null);
    try {
      const response = await fetch("/api/supabase/setup-table", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("curator_token") || ""}`
        }
      });
      const data = await safeResponseJson(response);
      if (data.success) {
        setActionMessage({ success: true, text: data.message });
        await fetchStatus();
      } else {
        setActionMessage({ success: false, text: data.message });
      }
    } catch (err: any) {
      setActionMessage({ success: false, text: err.message || "An unexpected error occurred" });
    } finally {
      setActionLoading(false);
    }
  };

  const sqlSchema = `create table if not exists curator_settings (
  id text primary key default 'default',
  data jsonb not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);`;

  const handleCopy = () => {
    navigator.clipboard.writeText(sqlSchema);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading && !status) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 flex flex-col justify-center items-center">
        <RefreshCw className="w-8 h-8 text-sky-500 animate-spin mb-3" />
        <p className="text-slate-500 text-sm">Querying database status...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Card */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-3xs overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/50 p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-slate-800 text-base">Supabase PostgreSQL Connection</h3>
              <p className="text-slate-500 text-xs">Manage cloud persistence tables and synchronization rules.</p>
            </div>
          </div>
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700 transition"
            title="Refresh database status"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Connection Config Status */}
            <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 flex flex-col justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Environment Setup</p>
                <h4 className="font-bold text-slate-700 text-sm mt-1">Credentials Declared</h4>
              </div>
              <div className="mt-4">
                {status?.configured ? (
                  <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-800 text-xs px-2.5 py-1 rounded-full font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Configured</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-800 text-xs px-2.5 py-1 rounded-full font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    <span>Using Local Storage</span>
                  </div>
                )}
              </div>
            </div>

            {/* Direct Connect DB URL Status */}
            <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 flex flex-col justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Automation Mode</p>
                <h4 className="font-bold text-slate-700 text-sm mt-1">Direct Connection</h4>
              </div>
              <div className="mt-4">
                {status?.hasDirectDbUrl ? (
                  <div className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-800 text-xs px-2.5 py-1 rounded-full font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500" />
                    <span>DATABASE_URL Active</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-600 text-xs px-2.5 py-1 rounded-full font-medium">
                    <span>No DATABASE_URL</span>
                  </div>
                )}
              </div>
            </div>

            {/* Table Existence Status */}
            <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 flex flex-col justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Table Verification</p>
                <h4 className="font-bold text-slate-700 text-sm mt-1">curator_settings Table</h4>
              </div>
              <div className="mt-4">
                {status?.exists ? (
                  <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-800 text-xs px-2.5 py-1 rounded-full font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Table Ready</span>
                  </div>
                ) : status?.configured ? (
                  <div className="inline-flex items-center gap-1.5 bg-rose-50 text-rose-800 text-xs px-2.5 py-1 rounded-full font-semibold animate-pulse">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                    <span>Table Missing</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-500 text-xs px-2.5 py-1 rounded-full font-medium">
                    <span>Not Checked</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Setup Action Message */}
          {actionMessage && (
            <div className={`p-4 rounded-xl border text-sm flex gap-2.5 ${
              actionMessage.success 
                ? "bg-emerald-50 border-emerald-100 text-emerald-800" 
                : "bg-rose-50 border-rose-100 text-rose-800"
            }`}>
              {actionMessage.success ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-bold">{actionMessage.success ? "Success" : "Execution Notice"}</p>
                <p className="text-xs mt-0.5 leading-relaxed">{actionMessage.text}</p>
              </div>
            </div>
          )}

          {/* Quick Actions Panel */}
          {status?.configured && !status.exists && (
            <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-5 space-y-4">
              <div className="flex gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-amber-900 text-sm">Table Setup Required</h4>
                  <p className="text-xs text-amber-800/90 mt-1 leading-relaxed">
                    To store configuration securely and enable real-time cloud sync, the <code>curator_settings</code> table must exist in your Supabase project. You can generate this automatically or manually.
                  </p>
                </div>
              </div>

              {status?.hasDirectDbUrl ? (
                <div className="pt-2 border-t border-amber-200/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <p className="text-xs text-amber-800">
                    We detected direct PostgreSQL connection details in your workspace variables.
                  </p>
                  <button
                    onClick={handleAutoCreate}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-4 py-2 rounded-lg shadow-sm transition disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    {actionLoading ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <PlayCircle className="w-3.5 h-3.5" />
                    )}
                    <span>Auto-Bootstrap Table</span>
                  </button>
                </div>
              ) : (
                <p className="text-xs text-amber-800 italic pt-2 border-t border-amber-200/50">
                  Tip: Declare <code>DATABASE_URL</code> in your secrets/variables panel to enable one-click automatic schema setup!
                </p>
              )}
            </div>
          )}

          {status?.configured && status.exists && (
            <div className="bg-emerald-50/30 border border-emerald-100 rounded-xl p-4 flex gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-emerald-900 text-sm">Database Sync is Active!</h4>
                <p className="text-xs text-emerald-800/90 mt-1 leading-relaxed">
                  Your server is fully synchronized with your live Supabase cloud PostgreSQL. All scrape jobs, curated items, credentials, and settings will persist indefinitely across restarts.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Manual SQL Instruction Card */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-3xs overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/50 p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 text-slate-700 rounded-lg">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-slate-800 text-base">Manual SQL Editor Setup</h3>
              <p className="text-slate-500 text-xs">Execute direct query commands in your Supabase Studio Dashboard.</p>
            </div>
          </div>
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 font-semibold text-xs px-3 py-1.5 rounded-lg transition"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-600 font-semibold">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy SQL Code</span>
              </>
            )}
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Steps */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-700 font-bold text-xs">
                <span className="bg-slate-100 w-5 h-5 rounded-full inline-flex items-center justify-center text-slate-800 text-[10px]">1</span>
                <span>Open Supabase Studio</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed pl-7">
                Log in to your Supabase project dashboard and navigate to the <b>SQL Editor</b> using the sidebar navigation tab.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-700 font-bold text-xs">
                <span className="bg-slate-100 w-5 h-5 rounded-full inline-flex items-center justify-center text-slate-800 text-[10px]">2</span>
                <span>Paste & Run Schema</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed pl-7">
                Click <b>"New query"</b>, paste the copyable schema code shown below, and press the blue <b>Run</b> button.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-700 font-bold text-xs">
                <span className="bg-slate-100 w-5 h-5 rounded-full inline-flex items-center justify-center text-slate-800 text-[10px]">3</span>
                <span>Verify Status</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed pl-7">
                Return to this workspace, click the <b>Refresh</b> button in the top-right corner to verify live cloud storage connection.
              </p>
            </div>
          </div>

          {/* SQL Editor Block */}
          <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-900 shadow-inner font-mono text-xs text-slate-300">
            <div className="flex items-center justify-between bg-slate-950 px-4 py-2 border-b border-slate-800 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
              <span>Postgres DDL Schema</span>
              <span className="text-[9px] text-sky-400 bg-sky-950/50 px-2 py-0.5 rounded border border-sky-900/40">JSONB Enabled</span>
            </div>
            <pre className="p-4 overflow-x-auto whitespace-pre leading-relaxed select-all">
              {sqlSchema}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
