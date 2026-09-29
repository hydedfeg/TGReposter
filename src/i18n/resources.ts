import arAi from "./locales/ar/ai";
import arAuth from "./locales/ar/auth";
import arCommon from "./locales/ar/common";
import arDashboard from "./locales/ar/dashboard";
import arDestinations from "./locales/ar/destinations";
import arInbox from "./locales/ar/inbox";
import arHistory from "./locales/ar/history";
import arFilters from "./locales/ar/filters";
import arSources from "./locales/ar/sources";
import arTeam from "./locales/ar/team";
import arNavigation from "./locales/ar/navigation";
import enAi from "./locales/en/ai";
import enAuth from "./locales/en/auth";
import enCommon from "./locales/en/common";
import enDashboard from "./locales/en/dashboard";
import enDestinations from "./locales/en/destinations";
import enInbox from "./locales/en/inbox";
import enHistory from "./locales/en/history";
import enFilters from "./locales/en/filters";
import enSources from "./locales/en/sources";
import enTeam from "./locales/en/team";
import enNavigation from "./locales/en/navigation";
import faAi from "./locales/fa/ai";
import faAuth from "./locales/fa/auth";
import faCommon from "./locales/fa/common";
import faDashboard from "./locales/fa/dashboard";
import faDestinations from "./locales/fa/destinations";
import faInbox from "./locales/fa/inbox";
import faHistory from "./locales/fa/history";
import faFilters from "./locales/fa/filters";
import faSources from "./locales/fa/sources";
import faTeam from "./locales/fa/team";
import faNavigation from "./locales/fa/navigation";
import ruAi from "./locales/ru/ai";
import ruAuth from "./locales/ru/auth";
import ruCommon from "./locales/ru/common";
import ruDashboard from "./locales/ru/dashboard";
import ruDestinations from "./locales/ru/destinations";
import ruInbox from "./locales/ru/inbox";
import ruHistory from "./locales/ru/history";
import ruFilters from "./locales/ru/filters";
import ruSources from "./locales/ru/sources";
import ruTeam from "./locales/ru/team";
import ruNavigation from "./locales/ru/navigation";
import type { AppLocale } from "./locales";

type LocaleResources = {
  ai: Record<string, unknown>;
  auth: Record<string, unknown>;
  common: Record<string, unknown>;
  dashboard: Record<string, unknown>;
  destinations: Record<string, unknown>;
  inbox: Record<string, unknown>;
  history: Record<string, unknown>;
  filters: Record<string, unknown>;
  sources: Record<string, unknown>;
  team: Record<string, unknown>;
  navigation: Record<string, unknown>;
};

export const i18nResources: Record<AppLocale, LocaleResources> = {
  en: { ai: enAi, auth: enAuth, common: enCommon, dashboard: enDashboard, destinations: enDestinations, inbox: enInbox, history: enHistory, filters: enFilters, sources: enSources, team: enTeam, navigation: enNavigation },
  ru: { ai: ruAi, auth: ruAuth, common: ruCommon, dashboard: ruDashboard, destinations: ruDestinations, inbox: ruInbox, history: ruHistory, filters: ruFilters, sources: ruSources, team: ruTeam, navigation: ruNavigation },
  ar: { ai: arAi, auth: arAuth, common: arCommon, dashboard: arDashboard, destinations: arDestinations, inbox: arInbox, history: arHistory, filters: arFilters, sources: arSources, team: arTeam, navigation: arNavigation },
  fa: { ai: faAi, auth: faAuth, common: faCommon, dashboard: faDashboard, destinations: faDestinations, inbox: faInbox, history: faHistory, filters: faFilters, sources: faSources, team: faTeam, navigation: faNavigation },
};
