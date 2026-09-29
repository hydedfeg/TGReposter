import arCommon from "./locales/ar/common";
import enCommon from "./locales/en/common";
import faCommon from "./locales/fa/common";
import ruCommon from "./locales/ru/common";
import type { AppLocale } from "./locales";

export const i18nResources: Record<AppLocale, { common: Record<string, unknown> }> = {
  en: { common: enCommon },
  ru: { common: ruCommon },
  ar: { common: arCommon },
  fa: { common: faCommon },
};
