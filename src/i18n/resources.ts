import arAuth from "./locales/ar/auth";
import arCommon from "./locales/ar/common";
import arDashboard from "./locales/ar/dashboard";
import arNavigation from "./locales/ar/navigation";
import enAuth from "./locales/en/auth";
import enCommon from "./locales/en/common";
import enDashboard from "./locales/en/dashboard";
import enNavigation from "./locales/en/navigation";
import faAuth from "./locales/fa/auth";
import faCommon from "./locales/fa/common";
import faDashboard from "./locales/fa/dashboard";
import faNavigation from "./locales/fa/navigation";
import ruAuth from "./locales/ru/auth";
import ruCommon from "./locales/ru/common";
import ruDashboard from "./locales/ru/dashboard";
import ruNavigation from "./locales/ru/navigation";
import type { AppLocale } from "./locales";

type LocaleResources = {
  auth: Record<string, unknown>;
  common: Record<string, unknown>;
  dashboard: Record<string, unknown>;
  navigation: Record<string, unknown>;
};

export const i18nResources: Record<AppLocale, LocaleResources> = {
  en: { auth: enAuth, common: enCommon, dashboard: enDashboard, navigation: enNavigation },
  ru: { auth: ruAuth, common: ruCommon, dashboard: ruDashboard, navigation: ruNavigation },
  ar: { auth: arAuth, common: arCommon, dashboard: arDashboard, navigation: arNavigation },
  fa: { auth: faAuth, common: faCommon, dashboard: faDashboard, navigation: faNavigation },
};
