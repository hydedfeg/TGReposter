import React, { useState } from "react";
import { Plus, Trash2, RefreshCw, Radio, CheckCircle, AlertTriangle, HelpCircle } from "lucide-react";
import { SourceChannel } from "../types";

interface SourceChannelsConfigProps {
  channels: SourceChannel[];
  onAddChannel: (username: string) => void;
  onRemoveChannel: (username: string) => void;
  onFetchChannel: (username: string) => void;
  onFetchAll: () => void;
  isGlobalFetching: boolean;
}

export default function SourceChannelsConfig({
  channels,
  onAddChannel,
  onRemoveChannel,
  onFetchChannel,
  onFetchAll,
  isGlobalFetching
}: SourceChannelsConfigProps) {
  const [newUsername, setNewUsername] = useState("");
  const [inputError, setInputError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setInputError("");
    const clean = newUsername.trim().replace(/^https:\/\/t\.me\//, "").replace(/^@/, "");
    
    if (!clean) {
      setInputError("Username cannot be empty");
      return;
    }

    if (channels.some(c => c.username.toLowerCase() === clean.toLowerCase())) {
      setInputError("Channel already exists");
      return;
    }

    onAddChannel(clean);
    setNewUsername("");
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 border-b border-slate-100 pb-4">
        <div>
          <h2 className="font-display font-bold text-lg text-slate-900 flex items-center gap-2">
            <Radio className="w-5 h-5 text-sky-500" />
            Targeted Channels
          </h2>
          <p className="text-slate-500 text-xs mt-0.5 font-sans">
            Scrape messages directly from public Telegram channels. No API credentials required.
          </p>
        </div>
        <button
          onClick={onFetchAll}
          disabled={isGlobalFetching || channels.length === 0}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-200 text-white disabled:text-slate-400 px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isGlobalFetching ? "animate-spin" : ""}`} />
          Scrape All Channels
        </button>
      </div>

      {/* Add New Channel Form */}
      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-2.5 text-slate-400 text-sm font-medium">@</span>
            <input
              type="text"
              placeholder="durov or techcrunch"
              value={newUsername}
              onChange={(e) => {
                setNewUsername(e.target.value);
                setInputError("");
              }}
              className="w-full pl-7 pr-3 py-2 border border-slate-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-lg text-sm bg-slate-50 focus:bg-white placeholder-slate-400 transition-all font-sans outline-hidden"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs px-4 py-2 rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Channel
          </button>
        </div>
        {inputError && (
          <p className="text-rose-500 text-xs font-medium mt-1.5 ml-1">{inputError}</p>
        )}
      </form>

      {/* Channel list */}
      {channels.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
          <HelpCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-slate-600">No Target Channels</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-[260px] mx-auto">
            Add a Telegram channel username above to begin collecting content.
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
          {channels.map((channel) => {
            const isFetching = channel.status === "fetching";
            const isSuccess = channel.status === "success";
            const isError = channel.status === "error";

            return (
              <div
                key={channel.username}
                className="flex items-center justify-between border border-slate-100 hover:border-slate-200 rounded-xl p-3.5 bg-slate-50/20 hover:bg-white transition-all shadow-2xs"
              >
                <div className="flex items-center gap-3">
                  {/* Status Indicator */}
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-display font-semibold text-sm select-none">
                      {(channel.name || channel.username).substring(0, 2).toUpperCase()}
                    </div>
                    <span
                      className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
                        isFetching
                          ? "bg-amber-400 animate-ping"
                          : isSuccess
                          ? "bg-emerald-500"
                          : isError
                          ? "bg-rose-500"
                          : "bg-slate-300"
                      }`}
                    />
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 leading-none">
                      {channel.name || `@${channel.username}`}
                    </h4>
                    <p className="text-slate-400 text-xs font-mono mt-1">
                      t.me/{channel.username}
                    </p>

                    {/* Meta labels */}
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1.5">
                      {isFetching && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md">
                          <RefreshCw className="w-2.5 h-2.5 animate-spin" /> Fetching
                        </span>
                      )}
                      {isSuccess && channel.lastFetched && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md font-mono">
                          <CheckCircle className="w-2.5 h-2.5" /> Scraped {new Date(channel.lastFetched).toLocaleTimeString()}
                        </span>
                      )}
                      {isError && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-md font-sans">
                          <AlertTriangle className="w-2.5 h-2.5 shrink-0" /> Failed
                        </span>
                      )}
                    </div>
                    {isError && channel.errorMessage && (
                      <p className="text-rose-500 text-[10px] font-medium mt-1 line-clamp-1 max-w-[200px]">
                        {channel.errorMessage}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onFetchChannel(channel.username)}
                    disabled={isFetching || isGlobalFetching}
                    title="Scrape this channel"
                    className="p-1.5 text-slate-500 hover:text-sky-600 hover:bg-sky-50 disabled:bg-transparent disabled:text-slate-300 rounded-lg transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
                  </button>
                  <button
                    onClick={() => onRemoveChannel(channel.username)}
                    disabled={isFetching || isGlobalFetching}
                    title="Remove channel"
                    className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 disabled:bg-transparent disabled:text-slate-300 rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
