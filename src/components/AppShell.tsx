import { useEffect, useState, type ReactNode } from "react";
import {
  Bot,
  CheckCircle2,
  Database,
  CreditCard,
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
import { useTranslation } from "react-i18next";
import type { DestinationTarget } from "../types";
import { getInitials } from "../utils/text";
import LanguageSelector from "./LanguageSelector";

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
  | "database"
  | "payments";

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
  labelKey: string;
  view: WorkspaceView;
}

const contentItems: NavItem[] = [
  { view: "dashboard", labelKey: "items.dashboard", icon: Home },
  { view: "feed", labelKey: "items.contentInbox", icon: Inbox },
  { view: "promotion", labelKey: "items.promotions", icon: Megaphone },
  { view: "history", labelKey: "items.publishingHistory", icon: History },
];

const personalItems: NavItem[] = [
  { view: "channels", labelKey: "items.sources", icon: Radio },
  { view: "filters", labelKey: "items.filters", icon: Filter },
  { view: "destination", labelKey: "items.destinations", icon: Bot },
  { view: "ai", labelKey: "items.aiConfiguration", icon: Sparkles },
];

const systemItems: NavItem[] = [
  { view: "team", labelKey: "items.teamAccess", icon: Users },
  { view: "database", labelKey: "items.systemSettings", icon: Database },
  { view: "payments", labelKey: "items.payments", icon: CreditCard },
];

const titleKeys: Record<WorkspaceView, string> = {
  dashboard: "titles.dashboard",
  feed: "titles.feed",
  history: "titles.history",
  promotion: "titles.promotion",
  channels: "titles.channels",
  filters: "titles.filters",
  destination: "titles.destination",
  ai: "titles.ai",
  team: "titles.team",
  database: "titles.database",
  payments: "titles.payments",
};

function SidebarButton({
  active,
  item,
  label,
  onSelect,
}: {
  active: boolean;
  item: NavItem;
  label: string;
  onSelect: (view: WorkspaceView) => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(item.view)}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-sm font-semibold transition-colors ${
        active
          ? "bg-sky-500 text-white shadow-lg shadow-sky-950/20"
          : "text-slate-300 hover:bg-white/8 hover:text-white"
      }`}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
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
  const { t } = useTranslation("navigation");
  const [moreOpen, setMoreOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem("tgreposter-sidebar-open") !== "false");
  const activeTargets = targets?.filter((target) => target.enabled).length || 0;
  const isMoreView = ["history", "channels", "filters", "destination", "ai", "team", "database", "payments"].includes(activeView);

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
    <div className="app-shell min-h-screen bg-slate-100/70 text-slate-950">
      <aside
        id="desktop-sidebar"
        className={`fixed inset-y-0 start-0 z-50 w-64 flex-col bg-slate-950 px-3 py-4 text-white ${sidebarOpen ? "hidden lg:flex" : "hidden"}`}
      >
        <div className="flex min-h-12 items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => navigate("dashboard")}
            className="flex min-h-12 min-w-0 items-center gap-3 rounded-xl px-2 text-start"
            aria-label={t("accessibility.openDashboard")}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500 shadow-lg shadow-sky-950/30">
              <Send className="h-5 w-5 -rotate-12" aria-hidden="true" />
            </span>
            <span className="truncate font-display text-xl font-bold tracking-tight">TGReposter</span>
          </button>
          <button
            type="button"
            onClick={() => setDesktopSidebarOpen(false)}
            aria-label={t("accessibility.closeSidebar")}
            aria-controls="desktop-sidebar"
            aria-expanded="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <PanelLeftClose className="rtl-mirror h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <nav className="mt-7 flex-1 overflow-y-auto" aria-label={t("accessibility.primaryNavigation")}>
          <p className="px-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{t("sections.contentOperations")}</p>
          <div className="mt-2 space-y-1">
            {contentItems.map((item) => (
              <div key={item.view}>
                <SidebarButton item={item} label={t(item.labelKey)} active={activeView === item.view} onSelect={navigate} />
              </div>
            ))}
          </div>

          <div className="my-5 border-t border-white/10" />
          <p className="px-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{t("sections.personalSetup")}</p>
          <div className="mt-2 space-y-1">
            {personalItems.map((item) => (
              <div key={item.view}>
                <SidebarButton item={item} label={t(item.labelKey)} active={activeView === item.view} onSelect={navigate} />
              </div>
            ))}
          </div>

          {currentUserRole === "super-admin" ? (
            <>
              <div className="my-5 border-t border-white/10" />
              <p className="px-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{t("sections.systemAdministration")}</p>
              <div className="mt-2 space-y-1">
                {systemItems.map((item) => (
                  <div key={item.view}>
                    <SidebarButton item={item} label={t(item.labelKey)} active={activeView === item.view} onSelect={navigate} />
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </nav>

        <div className="mt-4 border-t border-white/10 pt-4">
          <div className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-500 text-sm font-bold">
              {getInitials(currentUsername)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold" dir="auto" title={currentUsername || undefined}>{currentUsername || t("account.administrator")}</p>
              <p className="text-xs text-slate-400">{currentUserRole === "super-admin" ? t("account.systemOwner") : t("account.personalWorkspace")}</p>
            </div>
            <button
              type="button"
              onClick={onLogout}
              aria-label={t("accessibility.signOut")}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      <div className={`min-h-[100dvh] transition-[padding] duration-200 ${sidebarOpen ? "lg:ps-64" : "lg:ps-0"}`}>
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm lg:pt-0">
          <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6 xl:px-8">
            <div className="flex min-w-0 items-center gap-3">
              {!sidebarOpen ? (
                <button
                  type="button"
                  onClick={() => setDesktopSidebarOpen(true)}
                  aria-label={t("accessibility.openSidebar")}
                  aria-controls="desktop-sidebar"
                  aria-expanded="false"
                  className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 lg:flex"
                >
                  <PanelLeftOpen className="rtl-mirror h-5 w-5" aria-hidden="true" />
                </button>
              ) : null}
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500 text-white lg:hidden">
                <Send className="h-4 w-4 -rotate-12" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-display text-lg font-bold text-slate-950 sm:text-xl">{t(titleKeys[activeView])}</p>
                <p className="hidden text-sm text-slate-500 sm:block lg:hidden">{t("status.workspace")}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <LanguageSelector compact />
              <div
                className={`hidden min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold sm:flex ${
                  connected
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                }`}
              >
                {connected ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Settings className="h-4 w-4" aria-hidden="true" />}
                <span>{connected ? t("status.publishingTargetsReady", { count: activeTargets || 1 }) : t("status.publishingSetupRequired")}</span>
              </div>
              <button
                type="button"
                onClick={onLogout}
                aria-label={t("accessibility.signOut")}
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
          <button type="button" tabIndex={-1} onClick={() => setMoreOpen(false)} aria-label={t("accessibility.closeMoreNavigation")} className="fixed inset-0 z-[55] bg-slate-950/25 lg:hidden" />
          <div role="dialog" aria-modal="true" aria-labelledby="mobile-more-heading" className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] max-h-[70dvh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl lg:hidden">
          <div className="flex items-center justify-between px-2 py-2">
            <div>
              <p id="mobile-more-heading" className="font-display text-lg font-bold">{t("mobile.more")}</p>
              <p className="text-sm text-slate-500">{t("mobile.moreDescription")}</p>
            </div>
            <button
              type="button"
              autoFocus
              onClick={() => setMoreOpen(false)}
              aria-label={t("accessibility.closeMoreNavigation")}
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
              <History className="h-5 w-5 text-sky-600" aria-hidden="true" /> {t("items.publishingHistory")}
            </button>
            {personalItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  type="button"
                  key={item.view}
                  onClick={() => navigate(item.view)}
                  className="flex min-h-14 items-center gap-3 rounded-xl bg-slate-50 px-3 text-start text-sm font-semibold text-slate-700"
                >
                  <Icon className="h-5 w-5 text-sky-600" aria-hidden="true" />
                  {t(item.labelKey)}
                </button>
              );
            })}
            {currentUserRole === "super-admin"
              ? systemItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      type="button"
                      key={item.view}
                      onClick={() => navigate(item.view)}
                      className="flex min-h-14 items-center gap-3 rounded-xl bg-slate-50 px-3 text-start text-sm font-semibold text-slate-700"
                    >
                      <Icon className="h-5 w-5 text-sky-600" aria-hidden="true" />
                      {t(item.labelKey)}
                    </button>
                  );
                })
              : null}
          </div>
          <div className="mt-3 rounded-xl bg-slate-950 px-4 py-3 text-white">
            <div>
              <p className="break-words text-sm font-bold" dir="auto">{currentUsername || t("account.administrator")}</p>
              <p className="text-xs text-slate-400">{currentUserRole === "super-admin" ? t("account.systemOwner") : t("account.contentAdmin")}</p>
            </div>
          </div>
          </div>
        </>
      ) : null}

      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/98 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] lg:hidden"
        aria-label={t("accessibility.mobileNavigation")}
      >
        <div className="mx-auto flex max-w-xl items-center">
          <MobileNavButton active={activeView === "dashboard"} icon={Home} label={t("mobile.home")} onClick={() => navigate("dashboard")} />
          <MobileNavButton active={activeView === "feed"} icon={Inbox} label={t("mobile.inbox")} onClick={() => navigate("feed")} />
          <MobileNavButton active={activeView === "promotion"} icon={Megaphone} label={t("mobile.promotions")} onClick={() => navigate("promotion")} />
          <MobileNavButton active={isMoreView || moreOpen} expanded={moreOpen} icon={moreOpen ? X : Menu} label={t("mobile.more")} onClick={() => setMoreOpen((open) => !open)} />
        </div>
      </nav>
    </div>
  );
}
