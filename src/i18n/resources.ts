import arCommon from "./locales/ar/common";
import arNavigation from "./locales/ar/navigation";
import enCommon from "./locales/en/common";
import enNavigation from "./locales/en/navigation";
import faCommon from "./locales/fa/common";
import faNavigation from "./locales/fa/navigation";
import ruCommon from "./locales/ru/common";
import ruNavigation from "./locales/ru/navigation";
import type { AppLocale } from "./locales";

type LocaleResources = {
  common: Record<string, unknown>;
  navigation: Record<string, unknown>;
};

export const i18nResources: Record<AppLocale, LocaleResources> = {
  en: { common: enCommon, navigation: enNavigation },
  ru: { common: ruCommon, navigation: ruNavigation },
  ar: { common: arCommon, navigation: arNavigation },
  fa: { common: faCommon, navigation: faNavigation },
};
