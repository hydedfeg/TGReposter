import arAuth from "./locales/ar/auth";
import arCommon from "./locales/ar/common";
import arDashboard from "./locales/ar/dashboard";
import arInbox from "./locales/ar/inbox";
import arHistory from "./locales/ar/history";
import arFilters from "./locales/ar/filters";
import arSources from "./locales/ar/sources";
import arNavigation from "./locales/ar/navigation";
import enAuth from "./locales/en/auth";
import enCommon from "./locales/en/common";
import enDashboard from "./locales/en/dashboard";
import enInbox from "./locales/en/inbox";
import enHistory from "./locales/en/history";
import enFilters from "./locales/en/filters";
import enSources from "./locales/en/sources";
import enNavigation from "./locales/en/navigation";
import faAuth from "./locales/fa/auth";
import faCommon from "./locales/fa/common";
import faDashboard from "./locales/fa/dashboard";
import faInbox from "./locales/fa/inbox";
import faHistory from "./locales/fa/history";
import faFilters from "./locales/fa/filters";
import faSources from "./locales/fa/sources";
import faNavigation from "./locales/fa/navigation";
import ruAuth from "./locales/ru/auth";
import ruCommon from "./locales/ru/common";
import ruDashboard from "./locales/ru/dashboard";
import ruInbox from "./locales/ru/inbox";
import ruHistory from "./locales/ru/history";
import ruFilters from "./locales/ru/filters";
import ruSources from "./locales/ru/sources";
import ruNavigation from "./locales/ru/navigation";
import type { AppLocale } from "./locales";

type LocaleResources = {
  auth: Record<string, unknown>;
  common: Record<string, unknown>;
  dashboard: Record<string, unknown>;
  inbox: Record<string, unknown>;
  history: Record<string, unknown>;
  filters: Record<string, unknown>;
  sources: Record<string, unknown>;
  navigation: Record<string, unknown>;
};

export const i18nResources: Record<AppLocale, LocaleResources> = {
  en: { auth: enAuth, common: enCommon, dashboard: enDashboard, inbox: enInbox, history: enHistory, filters: enFilters, sources: enSources, navigation: enNavigation },
  ru: { auth: ruAuth, common: ruCommon, dashboard: ruDashboard, inbox: ruInbox, history: ruHistory, filters: ruFilters, sources: ruSources, navigation: ruNavigation },
  ar: { auth: arAuth, common: arCommon, dashboard: arDashboard, inbox: arInbox, history: arHistory, filters: arFilters, sources: arSources, navigation: arNavigation },
  fa: { auth: faAuth, common: faCommon, dashboard: faDashboard, inbox: faInbox, history: faHistory, filters: faFilters, sources: faSources, navigation: faNavigation },
};
