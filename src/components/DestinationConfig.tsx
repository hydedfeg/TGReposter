import React, { useState } from "react";
import { Bot, Check, AlertCircle, HelpCircle, Trash2, Plus, RefreshCw, Eye, EyeOff, Radio, Settings } from "lucide-react";
import { DestinationConfig as IDestinationConfig, DestinationTarget } from "../types";
import { safeResponseJson } from "../utils/api";

interface DestinationConfigProps {
  destination: IDestinationConfig;
  onSave: (token: string, targets: DestinationTarget[]) => Promise<boolean>;
  readOnly?: boolean;
}

export default function DestinationConfig({ destination, onSave, readOnly = false }: DestinationConfigProps) {
  const [botToken, setBotToken] = useState(destination.botToken || "");
  const [showToken, setShowToken] = useState(false);
  
  // List of targets in state for direct editing
  const [targets, setTargets] = useState<DestinationTarget[]>(destination.targets || []);
  
  // Form state for adding a new target
  const [newTargetName, setNewTargetName] = useState("");
  const [newTargetChannelId, setNewTargetChannelId] = useState("");
  
  // Testing states
  const [testingTargetId, setTestingTargetId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; targetId?: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleAddTarget = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTargetName.trim() || !newTargetChannelId.trim()) return;

    let cleanChannelId = newTargetChannelId.trim();
    if (!cleanChannelId.startsWith("@") && !cleanChannelId.startsWith("-") && isNaN(Number(cleanChannelId))) {
      cleanChannelId = `@${cleanChannelId}`;
    }

    const newTarget: DestinationTarget = {
      id: `target-${Date.now()}`,
      name: newTargetName.trim(),
      channelId: cleanChannelId,
      enabled: true,
      status: "idle"
    };

    const updatedTargets = [...targets, newTarget];
    setTargets(updatedTargets);
    setNewTargetName("");
    setNewTargetChannelId("");
    
    // Auto-save changes
    onSave(botToken.trim(), updatedTargets);
  };

  const handleRemoveTarget = (id: string) => {
    const updatedTargets = targets.filter(t => t.id !== id);
    setTargets(updatedTargets);
    if (testResult?.targetId === id) {
      setTestResult(null);
    }
    // Auto-save changes
    onSave(botToken.trim(), updatedTargets);
  };

  const handleToggleTarget = (id: string) => {
    const updatedTargets = targets.map(t => 
      t.id === id ? { ...t, enabled: !t.enabled } : t
    );
    setTargets(updatedTargets);
    onSave(botToken.trim(), updatedTargets);
  };

  const handleTestTarget = async (target: DestinationTarget) => {
    if (!botToken.trim()) {
      setTestResult({
        success: false,
        message: "Please specify your Telegram Bot Token first.",
        targetId: target.id
      });
      return;
    }

    setTestingTargetId(target.id);
    setTestResult(null);

    try {
      const savedToken = localStorage.getItem("curator_token");
      const res = await fetch("/api/test-bot", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(savedToken ? { "Authorization": `Bearer ${savedToken}` } : {})
        },
        body: JSON.stringify({
          botToken: botToken.trim(),
          channelId: target.channelId
        })
      });

      const data = await safeResponseJson(res);
      const isSuccess = res.ok && data.success;
      
      // Update local status
      const updatedTargets = targets.map(t => 
        t.id === target.id 
          ? { ...t, status: (isSuccess ? "success" : "error") as 'success' | 'error', errorMessage: isSuccess ? undefined : (data.error || "Verification failed") }
          : t
      );
      setTargets(updatedTargets);

      setTestResult({
        success: isSuccess,
        message: isSuccess 
          ? `Verified! Test message published to ${target.channelId}.` 
          : (data.error || "Connection failed. Check bot token and admin privileges."),
        targetId: target.id
      });

      // Save verified status
      onSave(botToken.trim(), updatedTargets);

    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || "An unexpected network error occurred.",
        targetId: target.id
      });
    } finally {
      setTestingTargetId(null);
    }
  };

  const handleSaveBotTokenOnly = async () => {
    setIsSaving(true);
    await onSave(botToken.trim(), targets);
    setIsSaving(false);
    setTestResult({
      success: true,
      message: "Bot Token successfully updated."
    });
    setTimeout(() => setTestResult(null), 3000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Configuration Form */}
      <div className="lg:col-span-8 space-y-6">
        
        {/* 1. Bot Credentials Section */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
          <h2 className="font-display font-bold text-base text-slate-900 flex items-center gap-2 mb-1.5">
            <Bot className="w-5 h-5 text-sky-500 animate-pulse" />
            1. Telegram Bot Token Configuration
          </h2>
          <p className="text-slate-500 text-xs mb-5 font-sans leading-relaxed">
            All destination channels and groups utilize the same Telegram bot. Please paste your secure bot token.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Telegram Bot Token
              </label>
              <div className="relative flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showToken ? "text" : "password"}
                    placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                    value={botToken}
                    disabled={readOnly}
                    onChange={(e) => setBotToken(e.target.value)}
                    className="w-full pl-3.5 pr-10 py-2.5 border border-slate-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-lg text-xs bg-slate-50/50 outline-hidden font-mono text-slate-800 disabled:opacity-85 disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-3.5 top-2.5 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={handleSaveBotTokenOnly}
                    disabled={isSaving}
                    className="px-4 py-2.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    Save Token
                  </button>
                )}
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5">
                Acquire this token by sending <code>/newbot</code> to <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-sky-500 hover:underline inline-flex items-center gap-0.5">@BotFather</a>.
              </p>
            </div>
          </div>
        </div>

        {/* 2. Destination targets list */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
          <h2 className="font-display font-bold text-base text-slate-900 flex items-center gap-2 mb-1.5">
            <Radio className="w-5 h-5 text-indigo-500" />
            2. Destination Channels & Groups
          </h2>
          <p className="text-slate-500 text-xs mb-5 font-sans leading-relaxed">
            Manage public or private Telegram channels/groups. When publishing a curated post, it goes to all active targets simultaneously.
          </p>

          {/* Target Addition Form */}
          {!readOnly && (
            <form onSubmit={handleAddTarget} className="bg-slate-50 border border-slate-100 rounded-xl p-4 mb-6 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-5">
                <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Friendly Name
                </label>
                <input
                  type="text"
                  placeholder="e.g., Tech Announcements"
                  value={newTargetName}
                  onChange={(e) => setNewTargetName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-lg text-xs outline-hidden"
                />
              </div>
              <div className="sm:col-span-5">
                <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Channel ID or Username
                </label>
                <input
                  type="text"
                  placeholder="e.g., @my_channel or -100123456"
                  value={newTargetChannelId}
                  onChange={(e) => setNewTargetChannelId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-lg text-xs font-mono outline-hidden"
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
            </form>
          )}

          {/* Targets List */}
          {targets.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-slate-200 rounded-xl text-slate-400">
              <Settings className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-xs font-semibold">No targets defined yet</p>
              <p className="text-[10px] mt-0.5">Add a friendly target channel or group using the form above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {targets.map((target) => {
                const isTesting = testingTargetId === target.id;
                const targetTestResult = testResult?.targetId === target.id ? testResult : null;

                return (
                  <div 
                    key={target.id}
                    className={`border rounded-xl p-3.5 transition-all flex flex-col gap-3.5 ${
                      target.enabled 
                        ? "border-slate-200 bg-white" 
                        : "border-slate-100 bg-slate-50/50 opacity-70"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={target.enabled}
                          disabled={readOnly}
                          onChange={() => handleToggleTarget(target.id)}
                          className="mt-1 h-4 w-4 rounded-sm border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Toggle active state"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-bold text-slate-800">{target.name}</h4>
                            {target.enabled ? (
                              <span className="bg-emerald-50 text-emerald-700 text-[9px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider">
                                Active
                              </span>
                            ) : (
                              <span className="bg-slate-100 text-slate-500 text-[9px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider">
                                Muted
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] font-mono text-slate-500 mt-0.5">{target.channelId}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-auto sm:ml-0">
                        {/* Status indicators */}
                        {target.status === "success" && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-bold bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md">
                            <Check className="w-3 h-3" /> Connected
                          </span>
                        )}
                        {target.status === "error" && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-rose-600 font-bold bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-md" title={target.errorMessage}>
                            <AlertCircle className="w-3 h-3" /> Failed
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => handleTestTarget(target)}
                          disabled={isTesting || !target.enabled || readOnly}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 hover:border-slate-300 bg-white text-slate-600 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {isTesting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3 text-sky-500" />}
                          Test Connection
                        </button>

                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => handleRemoveTarget(target.id)}
                            className="p-1.5 hover:bg-rose-50 hover:text-rose-600 text-slate-400 rounded-lg transition-colors cursor-pointer"
                            title="Remove destination"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Specific target verification feedback */}
                    {targetTestResult && (
                      <div className={`p-2.5 rounded-lg border text-xs flex gap-2 ${
                        targetTestResult.success 
                          ? "bg-emerald-50 border-emerald-100 text-emerald-800" 
                          : "bg-rose-50 border-rose-100 text-rose-800"
                      }`}>
                        {targetTestResult.success ? (
                          <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <p className="font-semibold">{targetTestResult.success ? "Verification Successful" : "Verification Failed"}</p>
                          <p className="text-[10px] mt-0.5 leading-normal">{targetTestResult.message}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Guide Card */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 lg:col-span-4 flex flex-col justify-between">
        <div>
          <h3 className="font-display font-bold text-slate-800 text-sm flex items-center gap-1.5 mb-4">
            <HelpCircle className="w-4.5 h-4.5 text-sky-500" />
            Multiple Destination Guide
          </h3>
          <p className="text-slate-500 text-xs mb-4 font-sans leading-relaxed">
            Configure one bot to broadcast curated content to multiple target feeds simultaneously.
          </p>

          <ol className="space-y-4 text-xs">
            <li className="flex gap-2.5">
              <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
              <div>
                <p className="font-bold text-slate-800">Assign Admin Privileges</p>
                <p className="text-slate-500 text-[11px] mt-0.5 leading-relaxed">
                  The bot must be added as an <b>Administrator</b> in every channel or group you configure on the left. Ensure it has <i>"Post Messages"</i> permissions.
                </p>
              </div>
            </li>
            <li className="flex gap-2.5">
              <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
              <div>
                <p className="font-bold text-slate-800">Support Private Channels</p>
                <p className="text-slate-500 text-[11px] mt-0.5 leading-relaxed">
                  For private channels, retrieve the numeric channel ID (typically starting with <code>-100</code>) by forwarding a post from the channel to a diagnostic bot like <code>@userinfobot</code>.
                </p>
              </div>
            </li>
            <li className="flex gap-2.5">
              <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
              <div>
                <p className="font-bold text-slate-800">Multi-Publishing Flow</p>
                <p className="text-slate-500 text-[11px] mt-0.5 leading-relaxed">
                  When you click <b>Publish Now</b> on the feed, the server iterates through all checked active targets and publishes the message.
                </p>
              </div>
            </li>
          </ol>
        </div>

        <div className="border-t border-slate-200 pt-4 mt-6 text-[10px] text-slate-400 leading-relaxed font-sans">
          All targets run concurrently. If a target is temporarily down or lacking permission, other active channels will still receive the post perfectly.
        </div>
      </div>
    </div>
  );
}
