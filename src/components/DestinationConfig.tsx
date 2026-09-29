import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bot, Check, AlertCircle, HelpCircle, Trash2, Plus, RefreshCw, Eye, EyeOff, Radio, Settings } from "lucide-react";
import type { DestinationConfig as IDestinationConfig, DestinationTarget } from "../types";
import { safeResponseJson } from "../utils/api";

interface DestinationConfigProps {
  destination: IDestinationConfig;
  onSave: (token: string, targets: DestinationTarget[]) => Promise<boolean>;
  readOnly?: boolean;
}

interface DestinationFeedback {
  success: boolean;
  message?: string;
  messageKey?: string;
  values?: Record<string, string>;
  targetId?: string;
}

export default function DestinationConfig({ destination, onSave, readOnly = false }: DestinationConfigProps) {
  const { t } = useTranslation("destinations");

  // Stored credentials never come back from the backend. This state holds only
  // a newly-entered token until it is sent once to the Vault endpoint.
  const [botToken, setBotToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  
  // List of targets in state for direct editing
  const [targets, setTargets] = useState<DestinationTarget[]>(destination.targets || []);

  useEffect(() => {
    setTargets(destination.targets || []);
  }, [destination.targets]);
  
  // Form state for adding a new target
  const [newTargetName, setNewTargetName] = useState("");
  const [newTargetChannelId, setNewTargetChannelId] = useState("");
  
  // Testing states
  const [testingTargetId, setTestingTargetId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<DestinationFeedback | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleAddTarget = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTargetName.trim() || !newTargetChannelId.trim()) return;

    let cleanChannelId = newTargetChannelId.trim();
    if (!cleanChannelId.startsWith("@") && !cleanChannelId.startsWith("-") && isNaN(Number(cleanChannelId))) {
      cleanChannelId = `@${cleanChannelId}`;
    }

    const newTarget: DestinationTarget = {
      id: `target-${crypto.randomUUID()}`,
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
    onSave("", updatedTargets);
  };

  const handleRemoveTarget = (id: string) => {
    const updatedTargets = targets.filter(t => t.id !== id);
    setTargets(updatedTargets);
    if (testResult?.targetId === id) {
      setTestResult(null);
    }
    // Auto-save changes
    onSave("", updatedTargets);
  };

  const handleToggleTarget = (id: string) => {
    const updatedTargets = targets.map(t => 
      t.id === id ? { ...t, enabled: !t.enabled } : t
    );
    setTargets(updatedTargets);
    onSave("", updatedTargets);
  };

  const handleTestTarget = async (target: DestinationTarget) => {
    if (!destination.botTokenConfigured) {
      setTestResult({
        success: false,
        messageKey: "feedback.saveTokenFirst",
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
          targetId: target.id,
          channelId: target.channelId
        })
      });

      const data = await safeResponseJson(res);
      const isSuccess = res.ok && data.success;
      
      // Update local status
      const updatedTargets = targets.map(targetItem =>
        targetItem.id === target.id
          ? { ...targetItem, status: (isSuccess ? "success" : "error") as 'success' | 'error', errorMessage: isSuccess ? undefined : (data.error || t("feedback.verificationFallback")) }
          : targetItem
      );
      setTargets(updatedTargets);

      setTestResult({
        success: isSuccess,
        ...(isSuccess
          ? { messageKey: "feedback.testPublished", values: { channelId: target.channelId } }
          : data.error
            ? { message: data.error }
            : { messageKey: "feedback.connectionFallback" }),
        targetId: target.id
      });

      // Save verified status
      onSave("", updatedTargets);

    } catch (err: any) {
      setTestResult({
        success: false,
        ...(err?.message ? { message: err.message } : { messageKey: "feedback.networkError" }),
        targetId: target.id
      });
    } finally {
      setTestingTargetId(null);
    }
  };

  const handleSaveBotTokenOnly = async () => {
    const token = botToken.trim();
    if (!token) {
      setTestResult({
        success: false,
        messageKey: "feedback.enterToken"
      });
      return;
    }

    setIsSaving(true);
    const success = await onSave(token, targets);
    setIsSaving(false);

    if (success) {
      setBotToken("");
      setTestResult({
        success: true,
        messageKey: "feedback.tokenStored"
      });
      setTimeout(() => setTestResult(null), 3000);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Configuration Form */}
      <div className="lg:col-span-8 space-y-6">
        
        {/* 1. Bot Credentials Section */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
          <h2 className="font-display font-bold text-base text-slate-900 flex items-center gap-2 mb-1.5">
            <Bot className="w-5 h-5 text-sky-500 animate-pulse" />
            {t("bot.title")}
          </h2>
          <p className="text-slate-500 text-xs mb-5 font-sans leading-relaxed">
            {t("bot.description")}
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                {t("bot.tokenLabel")}
              </label>
              <div className="relative flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showToken ? "text" : "password"}
                    placeholder={destination.botTokenConfigured ? t("bot.placeholderReplace") : t("bot.placeholderNew")}
                    value={botToken}
                    dir="ltr"
                    disabled={readOnly}
                    onChange={(e) => setBotToken(e.target.value)}
                    className="w-full ps-3.5 pe-10 py-2.5 border border-slate-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-lg text-xs bg-slate-50/50 outline-hidden font-mono text-slate-800 disabled:opacity-85 disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    aria-label={showToken ? t("bot.hideToken") : t("bot.showToken")}
                    className="absolute end-3.5 top-2.5 text-slate-400 hover:text-slate-600 transition-colors"
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
                    {isSaving ? t("bot.saving") : t("bot.save")}
                  </button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {destination.botTokenConfigured ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                    <Check className="h-3 w-3" />
                    {t("bot.stored")}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700">
                    <AlertCircle className="h-3 w-3" />
                    {t("bot.notConfigured")}
                  </span>
                )}
                <p className="text-[10px] text-slate-400">
                  {t("bot.acquirePrefix")} <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-sky-500 hover:underline" dir="ltr">@BotFather</a>. {t("bot.acquireSuffix")}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Destination targets list */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
          <h2 className="font-display font-bold text-base text-slate-900 flex items-center gap-2 mb-1.5">
            <Radio className="w-5 h-5 text-indigo-500" />
            {t("targets.title")}
          </h2>
          <p className="text-slate-500 text-xs mb-5 font-sans leading-relaxed">
            {t("targets.description")}
          </p>

          {/* Target Addition Form */}
          {!readOnly && (
            <form onSubmit={handleAddTarget} className="bg-slate-50 border border-slate-100 rounded-xl p-4 mb-6 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-5">
                <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  {t("targets.friendlyName")}
                </label>
                <input
                  type="text"
                  placeholder={t("targets.friendlyNamePlaceholder")}
                  value={newTargetName}
                  dir="auto"
                  onChange={(e) => setNewTargetName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-lg text-xs outline-hidden"
                />
              </div>
              <div className="sm:col-span-5">
                <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  {t("targets.channelId")}
                </label>
                <input
                  type="text"
                  placeholder={t("targets.channelIdPlaceholder")}
                  value={newTargetChannelId}
                  dir="ltr"
                  onChange={(e) => setNewTargetChannelId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-lg text-xs font-mono outline-hidden"
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  aria-label={t("targets.addTarget")}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> {t("targets.add")}
                </button>
              </div>
            </form>
          )}

          {/* Targets List */}
          {targets.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-slate-200 rounded-xl text-slate-400">
              <Settings className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-xs font-semibold">{t("targets.emptyTitle")}</p>
              <p className="text-[10px] mt-0.5">{t("targets.emptyDescription")}</p>
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
                          title={t("targets.toggle", { name: target.name })}
                          aria-label={t("targets.toggle", { name: target.name })}
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-bold text-slate-800" dir="auto">{target.name}</h4>
                            {target.enabled ? (
                              <span className="bg-emerald-50 text-emerald-700 text-[9px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider">
                                {t("targets.active")}
                              </span>
                            ) : (
                              <span className="bg-slate-100 text-slate-500 text-[9px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider">
                                {t("targets.muted")}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] font-mono text-slate-500 mt-0.5" dir="ltr">{target.channelId}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ms-auto sm:ms-0">
                        {/* Status indicators */}
                        {target.status === "success" && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-bold bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md">
                            <Check className="w-3 h-3" /> {t("targets.connected")}
                          </span>
                        )}
                        {target.status === "error" && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-rose-600 font-bold bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-md" title={target.errorMessage}>
                            <AlertCircle className="w-3 h-3" /> {t("targets.failed")}
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => handleTestTarget(target)}
                          disabled={isTesting || !target.enabled || readOnly}
                          aria-label={isTesting ? t("targets.testing") : t("targets.test")}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 hover:border-slate-300 bg-white text-slate-600 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {isTesting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3 text-sky-500" />}
                          {isTesting ? t("targets.testing") : t("targets.test")}
                        </button>

                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => handleRemoveTarget(target.id)}
                            className="p-1.5 hover:bg-rose-50 hover:text-rose-600 text-slate-400 rounded-lg transition-colors cursor-pointer"
                            title={t("targets.remove", { name: target.name })}
                            aria-label={t("targets.remove", { name: target.name })}
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
                          <p className="font-semibold">{targetTestResult.success ? t("feedback.verificationSuccessful") : t("feedback.verificationFailed")}</p>
                          <p className="text-[10px] mt-0.5 leading-normal" dir="auto">
                            {targetTestResult.messageKey ? t(targetTestResult.messageKey, targetTestResult.values) : targetTestResult.message}
                          </p>
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
            {t("guide.title")}
          </h3>
          <p className="text-slate-500 text-xs mb-4 font-sans leading-relaxed">
            {t("guide.intro")}
          </p>

          <ol className="space-y-4 text-xs">
            <li className="flex gap-2.5">
              <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
              <div>
                <p className="font-bold text-slate-800">{t("guide.adminTitle")}</p>
                <p className="text-slate-500 text-[11px] mt-0.5 leading-relaxed">
                  {t("guide.adminDescription")}
                </p>
              </div>
            </li>
            <li className="flex gap-2.5">
              <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
              <div>
                <p className="font-bold text-slate-800">{t("guide.privateTitle")}</p>
                <p className="text-slate-500 text-[11px] mt-0.5 leading-relaxed">
                  {t("guide.privateDescriptionPrefix")} <code dir="ltr">-100</code>{t("guide.privateDescriptionSuffix")} <code dir="ltr">@userinfobot</code>.
                </p>
              </div>
            </li>
            <li className="flex gap-2.5">
              <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
              <div>
                <p className="font-bold text-slate-800">{t("guide.multiTitle")}</p>
                <p className="text-slate-500 text-[11px] mt-0.5 leading-relaxed">
                  {t("guide.multiDescription")}
                </p>
              </div>
            </li>
          </ol>
        </div>

        <div className="border-t border-slate-200 pt-4 mt-6 text-[10px] text-slate-400 leading-relaxed font-sans">
          {t("guide.footer")}
        </div>
      </div>
    </div>
  );
}
