import arAuth from "./locales/ar/auth";
import arCommon from "./locales/ar/common";
import arNavigation from "./locales/ar/navigation";
import enAuth from "./locales/en/auth";
import enCommon from "./locales/en/common";
import enNavigation from "./locales/en/navigation";
import faAuth from "./locales/fa/auth";
import faCommon from "./locales/fa/common";
import faNavigation from "./locales/fa/navigation";
import ruAuth from "./locales/ru/auth";
import ruCommon from "./locales/ru/common";
import ruNavigation from "./locales/ru/navigation";
import type { AppLocale } from "./locales";

type LocaleResources = {
  auth: Record<string, unknown>;
  common: Record<string, unknown>;
  navigation: Record<string, unknown>;
};

export const i18nResources: Record<AppLocale, LocaleResources> = {
  en: { auth: enAuth, common: enCommon, navigation: enNavigation },
  ru: { auth: ruAuth, common: ruCommon, navigation: ruNavigation },
  ar: { auth: arAuth, common: arCommon, navigation: arNavigation },
  fa: { auth: faAuth, common: faCommon, navigation: faNavigation },
};
