import React, { useState } from "react";
import { Filter, X, Plus, Hash, ToggleLeft, ToggleRight } from "lucide-react";
import { FilterConfig as IFilterConfig } from "../types";

interface FilterConfigProps {
  filters: IFilterConfig;
  onUpdateFilters: (updated: IFilterConfig) => void;
}

export default function FilterConfig({ filters, onUpdateFilters }: FilterConfigProps) {
  const [posInput, setPosInput] = useState("");
  const [negInput, setNegInput] = useState("");
  const [hashInput, setHashInput] = useState("");

  const handleAddPositive = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = posInput.trim();
    if (clean && !filters.positiveKeywords.includes(clean)) {
      onUpdateFilters({
        ...filters,
        positiveKeywords: [...filters.positiveKeywords, clean]
      });
      setPosInput("");
    }
  };

  const handleAddNegative = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = negInput.trim();
    if (clean && !filters.negativeKeywords.includes(clean)) {
      onUpdateFilters({
        ...filters,
        negativeKeywords: [...filters.negativeKeywords, clean]
      });
      setNegInput("");
    }
  };

  const handleAddHashtag = (e: React.FormEvent) => {
    e.preventDefault();
    let clean = hashInput.trim();
    if (!clean) return;
    if (!clean.startsWith("#")) {
      clean = `#${clean}`;
    }
    if (clean && !filters.requiredHashtags.includes(clean)) {
      onUpdateFilters({
        ...filters,
        requiredHashtags: [...filters.requiredHashtags, clean]
      });
      setHashInput("");
    }
  };

  const removePositive = (kw: string) => {
    onUpdateFilters({
      ...filters,
      positiveKeywords: filters.positiveKeywords.filter(x => x !== kw)
    });
  };

  const removeNegative = (kw: string) => {
    onUpdateFilters({
      ...filters,
      negativeKeywords: filters.negativeKeywords.filter(x => x !== kw)
    });
  };

  const removeHashtag = (hash: string) => {
    onUpdateFilters({
      ...filters,
      requiredHashtags: filters.requiredHashtags.filter(x => x !== hash)
    });
  };

  const toggleCaseSensitive = () => {
    onUpdateFilters({
      ...filters,
      caseSensitive: !filters.caseSensitive
    });
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
      <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-6">
        <div>
          <h2 className="font-display font-bold text-lg text-slate-900 flex items-center gap-2">
            <Filter className="w-5 h-5 text-sky-500" />
            Curation Filters
          </h2>
          <p className="text-slate-500 text-xs mt-0.5 font-sans">
            Filtered matching posts arrive in your Pending list; others go directly to Archive.
          </p>
        </div>

        {/* Case Sensitive Switch */}
        <button
          onClick={toggleCaseSensitive}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
        >
          {filters.caseSensitive ? (
            <ToggleRight className="w-5 h-5 text-sky-600" />
          ) : (
            <ToggleLeft className="w-5 h-5 text-slate-400" />
          )}
          <span>Case Sensitive</span>
        </button>
      </div>

      <div className="space-y-6">
        {/* Positive Keywords (Must Match) */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
            Positive Keywords (Trigger Curation)
          </label>
          <form onSubmit={handleAddPositive} className="flex gap-2 mb-3">
            <input
              type="text"
              placeholder="e.g. AI, startup, benchmark"
              value={posInput}
              onChange={(e) => setPosInput(e.target.value)}
              className="flex-1 px-3 py-2 border border-slate-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-lg text-sm bg-slate-50/50 outline-hidden font-sans placeholder-slate-400"
            />
            <button
              type="submit"
              className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs px-3.5 rounded-lg flex items-center justify-center cursor-pointer transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </form>
          
          {filters.positiveKeywords.length === 0 ? (
            <p className="text-slate-400 text-xs italic">
              No positive keywords added. If no keywords or hashtags are defined, all scraped posts are matched.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {filters.positiveKeywords.map((kw) => (
                <span
                  key={kw}
                  className="inline-flex items-center gap-1 bg-sky-50 border border-sky-100 text-sky-800 text-xs pl-2.5 pr-1.5 py-1 rounded-lg font-medium"
                >
                  {kw}
                  <button
                    type="button"
                    onClick={() => removePositive(kw)}
                    className="hover:bg-sky-100 rounded-full p-0.5 text-sky-600 transition-all cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Required Hashtags */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
            Target Hashtags
          </label>
          <form onSubmit={handleAddHashtag} className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <span className="absolute left-3 top-2.5 text-slate-400 text-sm font-medium">#</span>
              <input
                type="text"
                placeholder="tech, ai, health"
                value={hashInput}
                onChange={(e) => setHashInput(e.target.value)}
                className="w-full pl-7 pr-3 py-2 border border-slate-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-lg text-sm bg-slate-50/50 outline-hidden font-sans placeholder-slate-400"
              />
            </div>
            <button
              type="submit"
              className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs px-3.5 rounded-lg flex items-center justify-center cursor-pointer transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </form>

          {filters.requiredHashtags.length === 0 ? (
            <p className="text-slate-400 text-xs italic">
              No target hashtags added.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {filters.requiredHashtags.map((hash) => (
                <span
                  key={hash}
                  className="inline-flex items-center gap-1 bg-indigo-50 border border-indigo-100 text-indigo-800 text-xs pl-2.5 pr-1.5 py-1 rounded-lg font-medium"
                >
                  <Hash className="w-3 h-3 text-indigo-500 shrink-0" />
                  {hash.replace(/^#/, "")}
                  <button
                    type="button"
                    onClick={() => removeHashtag(hash)}
                    className="hover:bg-indigo-100 rounded-full p-0.5 text-indigo-600 transition-all cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Negative Keywords (Silences/Filters) */}
        <div className="border-t border-slate-100 pt-5">
          <label className="block text-xs font-bold uppercase tracking-wider text-rose-700 mb-2">
            Negative Keywords (Ignore/Archive Immediately)
          </label>
          <form onSubmit={handleAddNegative} className="flex gap-2 mb-3">
            <input
              type="text"
              placeholder="e.g. promo, airdrop, crypto, spam"
              value={negInput}
              onChange={(e) => setNegInput(e.target.value)}
              className="flex-1 px-3 py-2 border border-slate-200 focus:border-rose-300 focus:ring-2 focus:ring-rose-50 rounded-lg text-sm bg-slate-50/50 outline-hidden font-sans placeholder-slate-400"
            />
            <button
              type="submit"
              className="bg-rose-900 hover:bg-rose-800 text-white font-semibold text-xs px-3.5 rounded-lg flex items-center justify-center cursor-pointer transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </form>

          {filters.negativeKeywords.length === 0 ? (
            <p className="text-slate-400 text-xs italic">
              No negative keywords. Add terms like "spam" or "ad" to auto-exclude them.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {filters.negativeKeywords.map((kw) => (
                <span
                  key={kw}
                  className="inline-flex items-center gap-1 bg-rose-50 border border-rose-100 text-rose-800 text-xs pl-2.5 pr-1.5 py-1 rounded-lg font-medium"
                >
                  {kw}
                  <button
                    type="button"
                    onClick={() => removeNegative(kw)}
                    className="hover:bg-rose-100 rounded-full p-0.5 text-rose-600 transition-all cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
