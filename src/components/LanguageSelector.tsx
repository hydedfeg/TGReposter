import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  APP_LOCALES,
  APP_LOCALE_DEFINITIONS,
  changeAppLocale,
  normalizeAppLocale,
} from "../i18n";

interface LanguageSelectorProps {
  className?: string;
  compact?: boolean;
}

export default function LanguageSelector({ className = "", compact = false }: LanguageSelectorProps) {
  const { t, i18n } = useTranslation("common");
  const currentLocale = normalizeAppLocale(i18n.language);

  return (
    <label
      className={`inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-700 shadow-sm ${className}`}
    >
      <Languages className="h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />
      {!compact ? <span className="hidden sm:inline">{t("languageSelector.label")}</span> : null}
      <select
        aria-label={t("languageSelector.label")}
        value={currentLocale}
        onChange={(event) => {
          void changeAppLocale(normalizeAppLocale(event.target.value));
        }}
        className="min-w-0 bg-transparent text-sm font-semibold text-slate-800 outline-none"
      >
        {APP_LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {APP_LOCALE_DEFINITIONS[locale].nativeName}
          </option>
        ))}
      </select>
    </label>
  );
}
