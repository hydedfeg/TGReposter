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
import arSystem from "./locales/ar/system";
import arPromotion from "./locales/ar/promotion";
import arMarketing from "./locales/ar/marketing";
import arNavigation from "./locales/ar/navigation";
import arBilling from "./locales/ar/billing";
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
import enSystem from "./locales/en/system";
import enPromotion from "./locales/en/promotion";
import enMarketing from "./locales/en/marketing";
import enNavigation from "./locales/en/navigation";
import enBilling from "./locales/en/billing";
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
import faSystem from "./locales/fa/system";
import faPromotion from "./locales/fa/promotion";
import faMarketing from "./locales/fa/marketing";
import faNavigation from "./locales/fa/navigation";
import faBilling from "./locales/fa/billing";
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
import ruSystem from "./locales/ru/system";
import ruPromotion from "./locales/ru/promotion";
import ruMarketing from "./locales/ru/marketing";
import ruNavigation from "./locales/ru/navigation";
import ruBilling from "./locales/ru/billing";
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
  system: Record<string, unknown>;
  promotion: Record<string, unknown>;
  marketing: Record<string, unknown>;
  navigation: Record<string, unknown>;
  billing: Record<string, unknown>;
};

export const i18nResources: Record<AppLocale, LocaleResources> = {
  en: { ai: enAi, auth: enAuth, common: enCommon, dashboard: enDashboard, destinations: enDestinations, inbox: enInbox, history: enHistory, filters: enFilters, sources: enSources, team: enTeam, system: enSystem, promotion: enPromotion, marketing: enMarketing, navigation: enNavigation, billing: enBilling },
  ru: { ai: ruAi, auth: ruAuth, common: ruCommon, dashboard: ruDashboard, destinations: ruDestinations, inbox: ruInbox, history: ruHistory, filters: ruFilters, sources: ruSources, team: ruTeam, system: ruSystem, promotion: ruPromotion, marketing: ruMarketing, navigation: ruNavigation, billing: ruBilling },
  ar: { ai: arAi, auth: arAuth, common: arCommon, dashboard: arDashboard, destinations: arDestinations, inbox: arInbox, history: arHistory, filters: arFilters, sources: arSources, team: arTeam, system: arSystem, promotion: arPromotion, marketing: arMarketing, navigation: arNavigation, billing: arBilling },
  fa: { ai: faAi, auth: faAuth, common: faCommon, dashboard: faDashboard, destinations: faDestinations, inbox: faInbox, history: faHistory, filters: faFilters, sources: faSources, team: faTeam, system: faSystem, promotion: faPromotion, marketing: faMarketing, navigation: faNavigation, billing: faBilling },
};
