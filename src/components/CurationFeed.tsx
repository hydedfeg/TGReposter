import React, { useState } from "react";
import {
  Sparkles,
  ExternalLink,
  Archive,
  CheckCircle,
  Clock,
  Trash,
  Copy,
  ChevronDown,
  ChevronUp,
  Languages,
  Check,
  Send,
  RefreshCw,
  Search,
  MessageSquare,
  Hash,
  AlertCircle,
  CornerDownRight,
  BookOpen,
  Radio
} from "lucide-react";
import { CuratedPost, DestinationTarget } from "../types";
import { safeResponseJson } from "../utils/api";

interface CurationFeedProps {
  posts: CuratedPost[];
  onUpdatePost: (postId: string, updatedFields: Partial<CuratedPost>) => void;
  onPostToTelegram: (postId: string, editedText: string, photoUrl?: string) => Promise<boolean>;
  isBotConfigured: boolean;
  onTriggerScrape: () => void;
  isScraping: boolean;
  targets?: DestinationTarget[];
}

type TabType = "pending" | "approved" | "posted" | "archived";

export default function CurationFeed({
  posts,
  onUpdatePost,
  onPostToTelegram,
  isBotConfigured,
  onTriggerScrape,
  isScraping,
  targets
}: CurationFeedProps) {
  const [activeTab, setActiveTab] = useState<TabType>("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editedText, setEditedText] = useState("");
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeTone, setActiveTone] = useState<string>("Professional");
  const [activeLang, setActiveLang] = useState<string>("English");

  // Filter posts based on tab and query
  const filteredPosts = posts.filter((post) => {
    const matchesTab = post.status === activeTab;
    const matchesQuery =
      post.originalText.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.channelUsername.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesQuery;
  });

  const handleStartEdit = (post: CuratedPost) => {
    setEditingPostId(post.id);
    setEditedText(post.text);
  };

  const handleSaveText = (postId: string) => {
    onUpdatePost(postId, { text: editedText });
    setEditingPostId(null);
  };

  const handleCancelEdit = () => {
    setEditingPostId(null);
  };

  // AI Assistant Call
  const handleAiAction = async (postId: string, postText: string, action: string, context?: string) => {
    setAiLoadingId(`${postId}-${action}`);
    try {
      const savedToken = localStorage.getItem("curator_token");
      const res = await fetch("/api/ai/curate", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(savedToken ? { "Authorization": `Bearer ${savedToken}` } : {})
        },
        body: JSON.stringify({
          action,
          text: postText,
          context
        })
      });

      const data = await safeResponseJson(res);
      if (res.ok && data.result) {
        if (editingPostId === postId) {
          // If editing, merge/replace in text input
          if (action === "hashtags") {
            setEditedText((prev) => `${prev}\n\n${data.result}`);
          } else {
            setEditedText(data.result);
          }
        } else {
          // Update db entry Directly
          let newText = data.result;
          if (action === "hashtags") {
            const p = posts.find((x) => x.id === postId);
            newText = `${p?.text || postText}\n\n${data.result}`;
          }
          onUpdatePost(postId, { text: newText });
        }
      } else {
        alert(data.error || "Gemini was unable to curate this post. Is your API Key configured?");
      }
    } catch (err: any) {
      alert(err.message || "Failed to contact Gemini API.");
    } finally {
      setAiLoadingId(null);
    }
  };

  const handleCopyToClipboard = (postId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(postId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handlePublish = async (postId: string, text: string, photoUrl?: string) => {
    if (!isBotConfigured) {
      alert("Please configure your Telegram Destination Bot first under the 'Destination' tab.");
      return;
    }

    setPublishingId(postId);
    try {
      const success = await onPostToTelegram(postId, text, photoUrl);
      if (success) {
        // Automatically switch tabs or notify
      }
    } catch (e) {
      // errors handled by parent
    } finally {
      setPublishingId(null);
    }
  };

  const tones = ["Professional", "Casual", "Punchy & Viral", "Insightful News", "Bullet Summary"];
  const languages = ["English", "Spanish", "Russian", "French", "German", "Chinese", "Arabic"];

  const getTabLabel = (tab: TabType) => {
    switch (tab) {
      case "pending":
        return "Inbox / Matches";
      case "approved":
        return "Approved";
      case "posted":
        return "Published";
      case "archived":
        return "Archive";
    }
  };

  const getTabBadgeColor = (tab: TabType) => {
    switch (tab) {
      case "pending":
        return "bg-amber-100 text-amber-800";
      case "approved":
        return "bg-indigo-100 text-indigo-800";
      case "posted":
        return "bg-emerald-100 text-emerald-800";
      case "archived":
        return "bg-slate-200 text-slate-700";
    }
  };

  return (
    <div className="space-y-6">
      {/* Search and Tabs panel */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          {(["pending", "approved", "posted", "archived"] as TabType[]).map((tab) => {
            const count = posts.filter((p) => p.status === tab).length;
            const isActive = activeTab === tab;

            return (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  setEditingPostId(null);
                }}
                className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  isActive
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span>{getTabLabel(tab)}</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  isActive ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search feed, channel, content..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-lg text-xs bg-slate-50 focus:bg-white outline-hidden transition-all"
          />
        </div>
      </div>

      {/* Main Feed Feed */}
      {filteredPosts.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs text-center py-20 px-4">
          <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-700">No curation posts found</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-[340px] mx-auto leading-relaxed">
            {searchQuery
              ? "No posts matches your search criteria. Try modifying your filter text or look under other tabs."
              : `There are currently no posts classified as '${getTabLabel(activeTab)}'. Click 'Scrape All' to harvest fresh feeds.`}
          </p>
          {!searchQuery && activeTab === "pending" && (
            <button
              onClick={onTriggerScrape}
              disabled={isScraping}
              className="mt-5 inline-flex items-center gap-1.5 bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs px-4 py-2 rounded-lg transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScraping ? "animate-spin" : ""}`} />
              Scrape Fresh Content Now
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {filteredPosts.map((post) => {
            const isEditing = editingPostId === post.id;
            const currentText = isEditing ? editedText : post.text;
            const isPostAiLoading = aiLoadingId?.startsWith(post.id);
            const isPostPublishing = publishingId === post.id;

            return (
              <div
                key={post.id}
                className={`bg-white rounded-xl border transition-all shadow-xs overflow-hidden ${
                  post.errorMessage
                    ? "border-rose-200 ring-1 ring-rose-100"
                    : post.status === "posted"
                    ? "border-emerald-100"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                {/* Header info */}
                <div className="bg-slate-50/50 border-b border-slate-100 px-5 py-3.5 flex flex-wrap justify-between items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-100 px-2.5 py-0.5 rounded-md">
                      @{post.channelUsername}
                    </span>
                    <span className="text-slate-300 font-sans">•</span>
                    <span className="text-slate-400 text-xs font-mono">
                      {new Date(post.date).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={post.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-400 hover:text-slate-600 text-xs flex items-center gap-0.5 transition-colors font-semibold"
                    >
                      Original Feed <ExternalLink className="w-3.5 h-3.5" />
                    </a>

                    {post.status === "posted" && post.postedAt && (
                      <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-xs font-semibold px-2 py-0.5 rounded-md">
                        <CheckCircle className="w-3.5 h-3.5" /> Published {new Date(post.postedAt).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 p-5">
                  {/* Left Column: Original and Media */}
                  <div className="md:col-span-5 space-y-4">
                    <div className="bg-slate-50/50 rounded-lg p-3.5 border border-slate-100">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Original Content</div>
                      <p className="text-xs text-slate-600 leading-relaxed font-sans whitespace-pre-wrap max-h-[160px] overflow-y-auto pr-1">
                        {post.originalText}
                      </p>
                    </div>

                    {post.photoUrl && (
                      <div className="relative group rounded-lg overflow-hidden border border-slate-100 max-h-[180px] bg-slate-900">
                        <img
                          src={post.photoUrl}
                          alt="Post attachment"
                          referrerPolicy="no-referrer"
                          className="w-full h-[180px] object-contain group-hover:scale-102 transition-transform duration-300"
                        />
                        <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-xs text-white text-[9px] px-2 py-0.5 rounded-md font-mono">
                          ATTACHED MEDIA
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Curated Editor & AI tools */}
                  <div className="md:col-span-7 space-y-4 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
                          <CornerDownRight className="w-3.5 h-3.5 text-sky-500" />
                          Curated Output Text (HTML Formatted)
                        </span>

                        {!isEditing && (
                          <button
                            onClick={() => handleStartEdit(post)}
                            className="text-xs font-semibold text-sky-600 hover:text-sky-700 hover:underline cursor-pointer"
                          >
                            Edit Manually
                          </button>
                        )}
                      </div>

                      {/* Editing Area */}
                      {isEditing ? (
                        <div className="space-y-2">
                          <textarea
                            value={editedText}
                            onChange={(e) => setEditedText(e.target.value)}
                            rows={6}
                            className="w-full p-3.5 border-2 border-sky-400 ring-4 ring-sky-50 rounded-xl text-sm bg-white outline-hidden font-sans leading-relaxed focus:ring-sky-100"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={handleCancelEdit}
                              className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 font-semibold cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSaveText(post.id)}
                              className="bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs px-4 py-1.5 rounded-lg cursor-pointer transition-colors"
                            >
                              Save Tweak
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={() => handleStartEdit(post)}
                          className="p-3.5 bg-slate-50 hover:bg-slate-100/50 border border-slate-100 hover:border-slate-200 rounded-xl cursor-pointer transition-all min-h-[140px] whitespace-pre-wrap text-sm text-slate-800 leading-relaxed font-sans"
                        >
                          {post.text}
                        </div>
                      )}
                    </div>

                    {/* Gemini AI curation toolbox */}
                    <div className="border-t border-slate-100 pt-4 mt-2">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                        <Sparkles className="w-3.5 h-3.5 text-sky-500 animate-bounce" />
                        AI Curation Toolkit (Gemini 3.5 Flash)
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        {/* Rephrase Tone */}
                        <div className="flex gap-1.5 items-center">
                          <select
                            value={activeTone}
                            onChange={(e) => setActiveTone(e.target.value)}
                            className="bg-white border border-slate-200 rounded-lg text-xs py-1.5 px-2.5 font-semibold focus:border-sky-500 outline-hidden font-sans"
                          >
                            {tones.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleAiAction(post.id, currentText, "rephrase", activeTone)}
                            disabled={!!isPostAiLoading}
                            className="inline-flex flex-1 justify-center items-center gap-1 bg-gradient-to-tr from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 text-white font-semibold text-xs py-1.5 px-3 rounded-lg cursor-pointer transition-all shadow-sm"
                          >
                            {isPostAiLoading && aiLoadingId?.includes("rephrase") ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <Sparkles className="w-3 h-3" />
                            )}
                            Rephrase Tone
                          </button>
                        </div>

                        {/* Translate */}
                        <div className="flex gap-1.5 items-center">
                          <select
                            value={activeLang}
                            onChange={(e) => setActiveLang(e.target.value)}
                            className="bg-white border border-slate-200 rounded-lg text-xs py-1.5 px-2.5 font-semibold focus:border-sky-500 outline-hidden font-sans"
                          >
                            {languages.map((l) => (
                              <option key={l} value={l}>{l}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleAiAction(post.id, currentText, "translate", activeLang)}
                            disabled={!!isPostAiLoading}
                            className="inline-flex flex-1 justify-center items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 font-semibold text-xs py-1.5 px-3 rounded-lg cursor-pointer transition-colors"
                          >
                            {isPostAiLoading && aiLoadingId?.includes("translate") ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <Languages className="w-3.5 h-3.5" />
                            )}
                            Translate
                          </button>
                        </div>
                      </div>

                      <div className="flex gap-2 mt-2">
                        {/* Auto Hashtags */}
                        <button
                          onClick={() => handleAiAction(post.id, currentText, "hashtags")}
                          disabled={!!isPostAiLoading}
                          className="inline-flex flex-1 justify-center items-center gap-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs py-1.5 px-3 rounded-lg cursor-pointer transition-colors"
                        >
                          {isPostAiLoading && aiLoadingId?.includes("hashtags") ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Hash className="w-3.5 h-3.5 text-indigo-500" />
                          )}
                          Auto Hashtags
                        </button>

                        {/* Summarize */}
                        <button
                          onClick={() => handleAiAction(post.id, currentText, "summarize")}
                          disabled={!!isPostAiLoading}
                          className="inline-flex flex-1 justify-center items-center gap-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs py-1.5 px-3 rounded-lg cursor-pointer transition-colors"
                        >
                          {isPostAiLoading && aiLoadingId?.includes("summarize") ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <BookOpen className="w-3.5 h-3.5 text-sky-500" />
                          )}
                          Summarize Post
                        </button>
                      </div>
                    </div>

                    {/* Active Targets Indicator */}
                    {targets && targets.filter(t => t.enabled).length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-xl px-3.5 py-2 mt-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1 shrink-0">
                          <Radio className="w-3.5 h-3.5 text-indigo-500 animate-pulse" /> Publish destinations:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {targets.filter(t => t.enabled).map(t => (
                            <span key={t.id} className="inline-flex items-center gap-1 text-[11px] font-bold bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md">
                              {t.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Action buttons footer */}
                    <div className="border-t border-slate-100 pt-4 mt-4 flex flex-wrap gap-2 justify-between items-center">
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleCopyToClipboard(post.id, currentText)}
                          className="inline-flex items-center justify-center gap-1 p-2 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors cursor-pointer text-xs font-semibold"
                          title="Copy curated text"
                        >
                          {copiedId === post.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                          <span>{copiedId === post.id ? "Copied" : "Copy"}</span>
                        </button>

                        {post.status !== "pending" && (
                          <button
                            onClick={() => onUpdatePost(post.id, { status: "pending" })}
                            className="inline-flex items-center justify-center gap-1 p-2 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors cursor-pointer text-xs font-semibold"
                          >
                            <Clock className="w-4 h-4" /> Move to Inbox
                          </button>
                        )}

                        {post.status !== "approved" && post.status !== "posted" && (
                          <button
                            onClick={() => onUpdatePost(post.id, { status: "approved" })}
                            className="inline-flex items-center justify-center gap-1 px-3 py-2 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors cursor-pointer text-xs font-bold"
                          >
                            Approve
                          </button>
                        )}
                      </div>

                      <div className="flex gap-2">
                        {post.status !== "archived" && (
                          <button
                            onClick={() => onUpdatePost(post.id, { status: "archived" })}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer text-xs font-semibold"
                            title="Send to Archive"
                          >
                            <Archive className="w-4 h-4" />
                            Archive
                          </button>
                        )}

                        {post.status === "archived" && (
                          <button
                            onClick={() => onUpdatePost(post.id, { status: "pending" })}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sky-600 hover:bg-sky-50 rounded-lg transition-all cursor-pointer text-xs font-semibold"
                          >
                            Restore
                          </button>
                        )}

                        {post.status !== "posted" && (
                          <button
                            onClick={() => handlePublish(post.id, currentText, post.photoUrl)}
                            disabled={isPostPublishing}
                            className="inline-flex items-center justify-center gap-1.5 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-200 text-white font-bold text-xs px-4 py-2 rounded-lg cursor-pointer transition-colors shadow-xs"
                          >
                            {isPostPublishing ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Publishing...
                              </>
                            ) : (
                              <>
                                <Send className="w-3.5 h-3.5 transform -rotate-12" /> Publish Now
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Display Error Message from posting */}
                    {post.errorMessage && (
                      <div className="mt-3 p-3 bg-rose-50 border border-rose-100 text-rose-800 text-xs rounded-lg flex gap-2">
                        <AlertCircle className="w-4.5 h-4.5 text-rose-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold">Last Publishing Error:</p>
                          <p className="mt-0.5">{post.errorMessage}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
