import React, { useState } from "react";
import { Sparkles, Cpu, CheckCircle2, AlertTriangle, Play, HelpCircle, ArrowRight } from "lucide-react";
import { AIConfig as IAIConfig } from "../types";
import { safeResponseJson } from "../utils/api";

interface AIConfigProps {
  aiConfig?: IAIConfig;
  onUpdateAI: (updated: IAIConfig) => void;
  geminiActive: boolean;
  openrouterActive: boolean;
}

export default function AIConfig({
  aiConfig = { provider: "gemini", model: "gemini-3.5-flash" },
  onUpdateAI,
  geminiActive,
  openrouterActive
}: AIConfigProps) {
  const [customModel, setCustomModel] = useState("");
  const [testText, setTestText] = useState("Scraping Telegram channels is a great way to curate industry newsletter posts.");
  const [testResult, setTestResult] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [testError, setTestError] = useState("");

  const providers = [
    {
      id: "gemini" as const,
      name: "Google Gemini",
      description: "Fast, highly intelligent native Google AI model suite.",
      envVar: "GEMINI_API_KEY",
      active: geminiActive,
      models: ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-pro", "gemini-1.5-flash"]
    },
    {
      id: "openrouter" as const,
      name: "OpenRouter",
      description: "Access any open-source or proprietary LLM via a unified endpoint.",
      envVar: "OPENROUTER_API_KEY",
      active: openrouterActive,
      models: [
        "google/gemini-2.5-flash",
        "meta-llama/llama-3-8b-instruct:free",
        "mistralai/mistral-7b-instruct:free",
        "meta-llama/llama-3-70b-instruct",
        "google/gemini-2.5-pro"
      ]
    }
  ];

  const handleProviderSelect = (provider: "gemini" | "openrouter") => {
    const selectedProv = providers.find(p => p.id === provider);
    const defaultModel = selectedProv ? selectedProv.models[0] : "gemini-3.5-flash";
    onUpdateAI({
      provider,
      model: defaultModel
    });
    setTestResult("");
    setTestError("");
  };

  const handleModelSelect = (modelName: string) => {
    onUpdateAI({
      ...aiConfig,
      model: modelName
    });
  };

  const handleCustomModelSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customModel.trim()) {
      onUpdateAI({
        ...aiConfig,
        model: customModel.trim()
      });
    }
  };

  const handleTestAI = async () => {
    if (!testText.trim()) return;
    setIsTesting(true);
    setTestResult("");
    setTestError("");

    try {
      const savedToken = localStorage.getItem("curator_token");
      const res = await fetch("/api/ai/curate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(savedToken ? { "Authorization": `Bearer ${savedToken}` } : {})
        },
        body: JSON.stringify({
          action: "rephrase",
          text: testText,
          context: "creative and viral"
        })
      });

      const data = await safeResponseJson(res);
      if (res.ok && data.result) {
        setTestResult(data.result);
      } else {
        throw new Error(data.error || "AI failed to generate test response");
      }
    } catch (err: any) {
      console.error(err);
      setTestError(err.message || "Connection failed. Check your API key configuration.");
    } finally {
      setIsTesting(false);
    }
  };

  const isCurrentModelCustom = !providers
    .find(p => p.id === aiConfig.provider)
    ?.models.includes(aiConfig.model);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-6">
        <div>
          <h2 className="font-display font-bold text-lg text-slate-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-500 animate-pulse" />
            AI Curation Engine
          </h2>
          <p className="text-slate-500 text-xs mt-0.5 font-sans">
            Configure the language model used to automatically rewrite, translate, and extract hashtags from posts.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Configuration Columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* Provider Selection */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
              Select AI Provider
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {providers.map(p => {
                const isSelected = aiConfig.provider === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => handleProviderSelect(p.id)}
                    className={`text-left p-4 rounded-xl border-2 transition-all cursor-pointer relative flex flex-col justify-between ${
                      isSelected
                        ? "border-indigo-600 bg-indigo-50/20 shadow-2xs"
                        : "border-slate-100 hover:border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <Cpu className={`w-5 h-5 ${isSelected ? "text-indigo-600" : "text-slate-400"}`} />
                        <span className="font-bold text-sm text-slate-900">{p.name}</span>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed mb-3">
                        {p.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100/50 w-full">
                      <span className="text-[10px] font-mono text-slate-400">{p.envVar}</span>
                      {p.active ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" /> Enabled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                          <AlertTriangle className="w-3 h-3" /> Missing Secret
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <p className="text-[11px] text-slate-400 mt-2.5 leading-relaxed flex items-start gap-1">
              <HelpCircle className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
              To change API keys, configure <b>GEMINI_API_KEY</b> or <b>OPENROUTER_API_KEY</b> in the AI Studio Settings &gt; Secrets panel. No manual keys can be written client-side.
            </p>
          </div>

          {/* Model Selection */}
          <div className="pt-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
              Select AI Model
            </label>
            <div className="flex flex-wrap gap-2 mb-4">
              {providers
                .find(p => p.id === aiConfig.provider)
                ?.models.map(m => {
                  const isSelected = aiConfig.model === m;
                  return (
                    <button
                      key={m}
                      onClick={() => handleModelSelect(m)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                        isSelected
                          ? "bg-slate-900 text-white shadow-2xs border border-slate-900"
                          : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-100"
                      }`}
                    >
                      {m}
                    </button>
                  );
                })}

              <button
                onClick={() => handleModelSelect(customModel || "custom-model")}
                className={`px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                  isCurrentModelCustom
                    ? "bg-slate-900 text-white shadow-2xs border border-slate-900"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-100"
                }`}
              >
                Custom Model...
              </button>
            </div>

            {(isCurrentModelCustom || aiConfig.provider === "openrouter") && (
              <form onSubmit={handleCustomModelSubmit} className="flex gap-2 max-w-md bg-slate-50 p-1 rounded-lg border border-slate-200">
                <input
                  type="text"
                  placeholder="e.g. meta-llama/llama-3.1-405b-instruct"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 text-xs outline-hidden font-mono bg-transparent"
                />
                <button
                  type="submit"
                  className="bg-slate-900 text-white text-[11px] font-bold px-3 py-1.5 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Apply
                </button>
              </form>
            )}

            <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
              <p className="text-xs text-slate-600">
                Current Active AI Model: <span className="font-mono font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-sm">{aiConfig.model}</span>
              </p>
            </div>
          </div>
        </div>

        {/* AI Playground Column */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Play className="w-3.5 h-3.5 text-indigo-500 fill-indigo-500" />
              AI test playground
            </h3>
            <p className="text-slate-500 text-[11px] leading-relaxed mb-3">
              Test your active AI provider and selected model instantly. This helper will attempt to curate the test text in a creative, viral tone.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Input Sample Text
                </label>
                <textarea
                  rows={3}
                  value={testText}
                  onChange={(e) => setTestText(e.target.value)}
                  placeholder="Paste some test text here..."
                  className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-white outline-hidden font-sans resize-none focus:ring-1 focus:ring-indigo-100 focus:border-indigo-500"
                />
              </div>

              {testResult && (
                <div className="bg-indigo-50/50 border border-indigo-100 rounded-lg p-2.5">
                  <p className="text-[10px] font-bold text-indigo-700 uppercase mb-1">Curated Output</p>
                  <p className="text-xs text-slate-700 leading-relaxed font-sans">{testResult}</p>
                </div>
              )}

              {testError && (
                <div className="bg-rose-50 border border-rose-100 rounded-lg p-2.5">
                  <p className="text-[10px] font-bold text-rose-700 uppercase mb-1">Curation Error</p>
                  <p className="text-xs text-rose-700 leading-relaxed font-sans">{testError}</p>
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200/50 mt-4">
            <button
              onClick={handleTestAI}
              disabled={isTesting || !testText.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-3xs"
            >
              {isTesting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Testing AI Connection...
                </>
              ) : (
                <>
                  <span>Run AI Test</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
