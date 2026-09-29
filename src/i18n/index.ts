import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import {
  APP_LOCALES,
  APP_LOCALE_DEFINITIONS,
  APP_LOCALE_STORAGE_KEY,
  DEFAULT_APP_LOCALE,
  getLocaleDirection,
  normalizeAppLocale,
  type AppLocale,
} from "./locales";
import { i18nResources } from "./resources";

function readStoredLocale(): AppLocale {
  if (typeof window === "undefined") return DEFAULT_APP_LOCALE;

  try {
    return normalizeAppLocale(window.localStorage.getItem(APP_LOCALE_STORAGE_KEY));
  } catch {
    return DEFAULT_APP_LOCALE;
  }
}

export function applyDocumentLocale(locale: AppLocale): void {
  if (typeof document === "undefined") return;

  document.documentElement.lang = locale;
  document.documentElement.dir = getLocaleDirection(locale);
}

const initialLocale = readStoredLocale();

void i18n
  .use(initReactI18next)
  .init({
    resources: i18nResources,
    lng: initialLocale,
    fallbackLng: DEFAULT_APP_LOCALE,
    supportedLngs: [...APP_LOCALES],
    defaultNS: "common",
    ns: ["common", "navigation", "auth"],
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

applyDocumentLocale(initialLocale);

i18n.on("languageChanged", (language) => {
  applyDocumentLocale(normalizeAppLocale(language));
});

export async function changeAppLocale(locale: AppLocale): Promise<void> {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, locale);
    } catch {
      // Language changes should continue even if browser storage is unavailable.
    }
  }

  await i18n.changeLanguage(locale);
}

export {
  APP_LOCALES,
  APP_LOCALE_DEFINITIONS,
  APP_LOCALE_STORAGE_KEY,
  DEFAULT_APP_LOCALE,
  getLocaleDirection,
  normalizeAppLocale,
};

export type { AppLocale };

export default i18n;
