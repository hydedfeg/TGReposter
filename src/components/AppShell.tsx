import { useEffect, useState, type ReactNode } from "react";
import {
  Bot,
  CheckCircle2,
  Database,
  Filter,
  History,
  Home,
  Inbox,
  LogOut,
  Megaphone,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Send,
  Settings,
  Sparkles,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { DestinationTarget } from "../types";

export type WorkspaceView =
  | "dashboard"
  | "feed"
  | "history"
  | "promotion"
  | "channels"
  | "filters"
  | "destination"
  | "ai"
  | "team"
  | "database";

type UserRole = "super-admin" | "admin" | null;

interface AppShellProps {
  activeView: WorkspaceView;
  children: ReactNode;
  connected: boolean;
  currentUsername: string | null;
  currentUserRole: UserRole;
  onLogout: () => void;
  onNavigate: (view: WorkspaceView) => void;
  targets?: DestinationTarget[];
}

interface NavItem {
  icon: LucideIcon;
  label: string;
  view: WorkspaceView;
}

const contentItems: NavItem[] = [
  { view: "dashboard", label: "Dashboard", icon: Home },
  { view: "feed", label: "My Content Inbox", icon: Inbox },
  { view: "promotion", label: "Promotions", icon: Megaphone },
  { view: "history", label: "Publishing History", icon: History },
];

const personalItems: NavItem[] = [
  { view: "destination", label: "My Destinations", icon: Bot },
];

const setupItems: NavItem[] = [
  { view: "channels", label: "Sources", icon: Radio },
  { view: "filters", label: "Filters", icon: Filter },
  { view: "ai", label: "AI Configuration", icon: Sparkles },
  { view: "team", label: "Team", icon: Users },
  { view: "database", label: "System Settings", icon: Database },
];

const titles: Record<WorkspaceView, string> = {
  dashboard: "Dashboard",
  feed: "My Content Inbox",
  history: "Publishing History",
  promotion: "Promotions",
  channels: "Source Channels",
  filters: "Content Filters",
  destination: "My Destinations",
  ai: "AI Configuration",
  team: "Team",
  database: "System Settings",
};

function initials(username: string | null) {
  if (!username) return "TG";
  return username.trim().slice(0, 2).toUpperCase();
}

function SidebarButton({
  active,
  item,
  onSelect,
}: {
  active: boolean;
  item: NavItem;
  onSelect: (view: WorkspaceView) => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(item.view)}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
        active
          ? "bg-sky-500 text-white shadow-lg shadow-sky-950/20"
          : "text-slate-300 hover:bg-white/8 hover:text-white"
      }`}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span>{item.label}</span>
    </button>
  );
}

function MobileNavButton({
  active,
  expanded,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  expanded?: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-expanded={expanded}
      className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold transition-colors ${
        active ? "text-sky-600" : "text-slate-500"
      }`}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

export default function AppShell({
  activeView,
  children,
  connected,
  currentUsername,
  currentUserRole,
  onLogout,
  onNavigate,
  targets,
}: AppShellProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem("tgreposter-sidebar-open") !== "false");
  const activeTargets = targets?.filter((target) => target.enabled).length || 0;
  const isMoreView = ["history", "channels", "filters", "destination", "ai", "team", "database"].includes(activeView);

  useEffect(() => {
    setMoreOpen(false);
  }, [activeView]);

  useEffect(() => {
    if (!moreOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreOpen]);

  const navigate = (view: WorkspaceView) => {
    onNavigate(view);
    setMoreOpen(false);
  };

  const setDesktopSidebarOpen = (open: boolean) => {
    setSidebarOpen(open);
    localStorage.setItem("tgreposter-sidebar-open", String(open));
  };

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-950">
      <aside
        id="desktop-sidebar"
        className={`fixed inset-y-0 left-0 z-50 w-64 flex-col bg-slate-950 px-3 py-4 text-white ${sidebarOpen ? "hidden lg:flex" : "hidden"}`}
      >
        <div className="flex min-h-12 items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => navigate("dashboard")}
            className="flex min-h-12 min-w-0 items-center gap-3 rounded-xl px-2 text-left"
            aria-label="Open TGReposter dashboard"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500 shadow-lg shadow-sky-950/30">
              <Send className="h-5 w-5 -rotate-12" aria-hidden="true" />
            </span>
            <span className="truncate font-display text-xl font-bold tracking-tight">TGReposter</span>
          </button>
          <button
            type="button"
            onClick={() => setDesktopSidebarOpen(false)}
            aria-label="Close sidebar"
            aria-controls="desktop-sidebar"
            aria-expanded="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <PanelLeftClose className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <nav className="mt-7 flex-1 overflow-y-auto" aria-label="Primary navigation">
          <p className="px-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Content operations</p>
          <div className="mt-2 space-y-1">
            {contentItems.map((item) => (
              <div key={item.view}>
                <SidebarButton item={item} active={activeView === item.view} onSelect={navigate} />
              </div>
            ))}
          </div>

          <div className="my-5 border-t border-white/10" />
          <p className="px-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Personal setup</p>
          <div className="mt-2 space-y-1">
            {personalItems.map((item) => (
              <div key={item.view}>
                <SidebarButton item={item} active={activeView === item.view} onSelect={navigate} />
              </div>
            ))}
          </div>

          {currentUserRole === "super-admin" ? (
            <>
              <div className="my-5 border-t border-white/10" />
              <p className="px-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Super-admin setup</p>
              <div className="mt-2 space-y-1">
                {setupItems.map((item) => (
                  <div key={item.view}>
                    <SidebarButton item={item} active={activeView === item.view} onSelect={navigate} />
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </nav>

        <div className="mt-4 border-t border-white/10 pt-4">
          <div className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-500 text-sm font-bold">
              {initials(currentUsername)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{currentUsername || "Administrator"}</p>
              <p className="text-xs text-slate-400">{currentUserRole === "super-admin" ? "System owner" : "Content admin"}</p>
            </div>
            <button
              type="button"
              onClick={onLogout}
              aria-label="Sign out"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      <div className={`min-h-screen transition-[padding] duration-200 ${sidebarOpen ? "lg:pl-64" : "lg:pl-0"}`}>
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
          <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6 xl:px-8">
            <div className="flex min-w-0 items-center gap-3">
              {!sidebarOpen ? (
                <button
                  type="button"
                  onClick={() => setDesktopSidebarOpen(true)}
                  aria-label="Open sidebar"
                  aria-controls="desktop-sidebar"
                  aria-expanded="false"
                  className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 lg:flex"
                >
                  <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />
                </button>
              ) : null}
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500 text-white lg:hidden">
                <Send className="h-4 w-4 -rotate-12" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-display text-lg font-bold text-slate-950 sm:text-xl">{titles[activeView]}</p>
                <p className="hidden text-sm text-slate-500 sm:block lg:hidden">TGReposter workspace</p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <div
                className={`hidden min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold sm:flex ${
                  connected
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                }`}
              >
                {connected ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Settings className="h-4 w-4" aria-hidden="true" />}
                <span>{connected ? `${activeTargets || 1} publishing target${activeTargets === 1 ? "" : "s"} ready` : "Publishing setup required"}</span>
              </div>
              <button
                type="button"
                onClick={onLogout}
                aria-label="Sign out"
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 lg:hidden"
              >
                <LogOut className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1680px] px-4 py-5 pb-28 sm:px-6 sm:py-6 lg:pb-8 xl:px-8">
          {children}
        </main>
      </div>

      {moreOpen ? (
        <>
          <button type="button" tabIndex={-1} onClick={() => setMoreOpen(false)} aria-label="Close more navigation" className="fixed inset-0 z-[55] bg-slate-950/25 lg:hidden" />
          <div role="dialog" aria-modal="true" aria-labelledby="mobile-more-heading" className="fixed inset-x-4 bottom-20 z-[60] max-h-[70vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl lg:hidden">
          <div className="flex items-center justify-between px-2 py-2">
            <div>
              <p id="mobile-more-heading" className="font-display text-lg font-bold">More</p>
              <p className="text-sm text-slate-500">History and workspace settings</p>
            </div>
            <button
              type="button"
              autoFocus
              onClick={() => setMoreOpen(false)}
              aria-label="Close more navigation"
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-600"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => navigate("history")}
              className="flex min-h-14 items-center gap-3 rounded-xl bg-slate-50 px-3 text-sm font-semibold text-slate-700"
            >
              <History className="h-5 w-5 text-sky-600" aria-hidden="true" /> Publishing History
            </button>
            {personalItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  type="button"
                  key={item.view}
                  onClick={() => navigate(item.view)}
                  className="flex min-h-14 items-center gap-3 rounded-xl bg-slate-50 px-3 text-left text-sm font-semibold text-slate-700"
                >
                  <Icon className="h-5 w-5 text-sky-600" aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
            {currentUserRole === "super-admin"
              ? setupItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      type="button"
                      key={item.view}
                      onClick={() => navigate(item.view)}
                      className="flex min-h-14 items-center gap-3 rounded-xl bg-slate-50 px-3 text-left text-sm font-semibold text-slate-700"
                    >
                      <Icon className="h-5 w-5 text-sky-600" aria-hidden="true" />
                      {item.label}
                    </button>
                  );
                })
              : null}
          </div>
          <div className="mt-3 rounded-xl bg-slate-950 px-4 py-3 text-white">
            <div>
              <p className="text-sm font-bold">{currentUsername || "Administrator"}</p>
              <p className="text-xs text-slate-400">{currentUserRole === "super-admin" ? "System owner" : "Content admin"}</p>
            </div>
          </div>
          </div>
        </>
      ) : null}

      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/98 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] lg:hidden"
        aria-label="Mobile navigation"
      >
        <div className="mx-auto flex max-w-xl items-center">
          <MobileNavButton active={activeView === "dashboard"} icon={Home} label="Home" onClick={() => navigate("dashboard")} />
          <MobileNavButton active={activeView === "feed"} icon={Inbox} label="Inbox" onClick={() => navigate("feed")} />
          <MobileNavButton active={activeView === "promotion"} icon={Megaphone} label="Promotions" onClick={() => navigate("promotion")} />
          <MobileNavButton active={isMoreView || moreOpen} expanded={moreOpen} icon={moreOpen ? X : Menu} label="More" onClick={() => setMoreOpen((open) => !open)} />
        </div>
      </nav>
    </div>
  );
}
