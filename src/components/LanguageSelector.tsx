import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  APP_LOCALES,
  APP_LOCALE_DEFINITIONS,
  normalizeAppLocale,
} from "../i18n";
import { changeAndPersistAppLocale } from "../i18n/userLocalePreference";

interface LanguageSelectorProps {
  className?: string;
  compact?: boolean;
  variant?: "light" | "dark";
}

export default function LanguageSelector({
  className = "",
  compact = false,
  variant = "light",
}: LanguageSelectorProps) {
  const { t, i18n } = useTranslation("common");
  const currentLocale = normalizeAppLocale(i18n.language);
  const isDark = variant === "dark";

  return (
    <label
      className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-2.5 text-sm font-semibold ${
        isDark
          ? "border-white/15 bg-white/[0.04] text-slate-200 shadow-none"
          : "border-slate-200 bg-white text-slate-700 shadow-sm"
      } ${className}`}
    >
      <Languages
        className={`h-4 w-4 shrink-0 ${isDark ? "text-cyan-200" : "text-sky-600"}`}
        aria-hidden="true"
      />
      {!compact ? <span className="hidden sm:inline">{t("languageSelector.label")}</span> : null}
      <select
        aria-label={t("languageSelector.label")}
        value={currentLocale}
        onChange={(event) => {
          void changeAndPersistAppLocale(normalizeAppLocale(event.target.value));
        }}
        className={`min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none ${
          isDark ? "text-white" : "text-slate-800"
        }`}
      >
        {APP_LOCALES.map((locale) => (
          <option
            key={locale}
            value={locale}
            className={isDark ? "bg-[#061725] text-white" : "bg-white text-slate-900"}
          >
            {APP_LOCALE_DEFINITIONS[locale].nativeName}
          </option>
        ))}
      </select>
    </label>
  );
}
