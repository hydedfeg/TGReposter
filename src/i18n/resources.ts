import arAuth from "./locales/ar/auth";
import arCommon from "./locales/ar/common";
import arDashboard from "./locales/ar/dashboard";
import arInbox from "./locales/ar/inbox";
import arNavigation from "./locales/ar/navigation";
import enAuth from "./locales/en/auth";
import enCommon from "./locales/en/common";
import enDashboard from "./locales/en/dashboard";
import enInbox from "./locales/en/inbox";
import enNavigation from "./locales/en/navigation";
import faAuth from "./locales/fa/auth";
import faCommon from "./locales/fa/common";
import faDashboard from "./locales/fa/dashboard";
import faInbox from "./locales/fa/inbox";
import faNavigation from "./locales/fa/navigation";
import ruAuth from "./locales/ru/auth";
import ruCommon from "./locales/ru/common";
import ruDashboard from "./locales/ru/dashboard";
import ruInbox from "./locales/ru/inbox";
import ruNavigation from "./locales/ru/navigation";
import type { AppLocale } from "./locales";

type LocaleResources = {
  auth: Record<string, unknown>;
  common: Record<string, unknown>;
  dashboard: Record<string, unknown>;
  inbox: Record<string, unknown>;
  navigation: Record<string, unknown>;
};

export const i18nResources: Record<AppLocale, LocaleResources> = {
  en: { auth: enAuth, common: enCommon, dashboard: enDashboard, inbox: enInbox, navigation: enNavigation },
  ru: { auth: ruAuth, common: ruCommon, dashboard: ruDashboard, inbox: ruInbox, navigation: ruNavigation },
  ar: { auth: arAuth, common: arCommon, dashboard: arDashboard, inbox: arInbox, navigation: arNavigation },
  fa: { auth: faAuth, common: faCommon, dashboard: faDashboard, inbox: faInbox, navigation: faNavigation },
};
