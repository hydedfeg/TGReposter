import { useState } from "react";
import { BrainCircuit, Megaphone } from "lucide-react";
import type { CuratedPost } from "../types";
import PromotionAIStudio from "./PromotionAIStudio";
import PromotionWorkspace from "./PromotionWorkspace";

type UserRole = "super-admin" | "admin" | null;
type PromotionView = "campaigns" | "ai";

interface PromotionCenterProps {
  posts: CuratedPost[];
  currentUserRole: UserRole;
  onToast: (message: string, type?: "success" | "error") => void;
}

export default function PromotionCenter({ posts, currentUserRole, onToast }: PromotionCenterProps) {
  const [view, setView] = useState<PromotionView>("campaigns");

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-2 shadow-3xs flex flex-wrap gap-1">
        <button
          onClick={() => setView("campaigns")}
          className={`flex-1 min-w-[180px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
            view === "campaigns" ? "bg-slate-900 text-white shadow-2xs" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <Megaphone className="w-4 h-4" />
          Campaign Workspace
        </button>
        <button
          onClick={() => setView("ai")}
          className={`flex-1 min-w-[180px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
            view === "ai" ? "bg-violet-600 text-white shadow-2xs" : "text-violet-700 hover:bg-violet-50"
          }`}
        >
          <BrainCircuit className="w-4 h-4" />
          AI Promotion Studio
        </button>
      </div>

      {view === "campaigns" ? (
        <PromotionWorkspace
          posts={posts}
          currentUserRole={currentUserRole}
          onToast={onToast}
        />
      ) : (
        <PromotionAIStudio
          currentUserRole={currentUserRole}
          onToast={onToast}
        />
      )}
    </div>
  );
}
