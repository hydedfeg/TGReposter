export const APP_LOCALES = ["en", "ru", "ar", "fa"] as const;

export type AppLocale = (typeof APP_LOCALES)[number];
export type AppDirection = "ltr" | "rtl";

export interface AppLocaleDefinition {
  code: AppLocale;
  name: string;
  nativeName: string;
  direction: AppDirection;
}

export const DEFAULT_APP_LOCALE: AppLocale = "en";
export const APP_LOCALE_STORAGE_KEY = "tgreposter-locale";

export const APP_LOCALE_DEFINITIONS: Record<AppLocale, AppLocaleDefinition> = {
  en: {
    code: "en",
    name: "English",
    nativeName: "English",
    direction: "ltr",
  },
  ru: {
    code: "ru",
    name: "Russian",
    nativeName: "Русский",
    direction: "ltr",
  },
  ar: {
    code: "ar",
    name: "Arabic",
    nativeName: "العربية",
    direction: "rtl",
  },
  fa: {
    code: "fa",
    name: "Persian",
    nativeName: "فارسی",
    direction: "rtl",
  },
};

export function isAppLocale(value: string | null | undefined): value is AppLocale {
  return !!value && APP_LOCALES.includes(value as AppLocale);
}

export function matchAppLocale(value: string | null | undefined): AppLocale | null {
  if (!value) return null;

  const language = value
    .trim()
    .toLowerCase()
    .replace("_", "-")
    .split("-")[0];

  return isAppLocale(language) ? language : null;
}

export function normalizeAppLocale(value: string | null | undefined): AppLocale {
  return matchAppLocale(value) ?? DEFAULT_APP_LOCALE;
}

export function getLocaleDirection(locale: string | null | undefined): AppDirection {
  return APP_LOCALE_DEFINITIONS[normalizeAppLocale(locale)].direction;
}
