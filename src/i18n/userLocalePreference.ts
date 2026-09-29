import i18n, { changeAppLocale, normalizeAppLocale, type AppLocale } from "./index";
import { isAppLocale } from "./locales";

function browserToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem("curator_token")?.trim() || "";
  } catch {
    return "";
  }
}

export async function persistAuthenticatedAppLocale(
  locale: AppLocale,
  token = browserToken(),
): Promise<boolean> {
  if (!token || typeof fetch === "undefined") return false;

  try {
    const response = await fetch("/api/auth/ui-locale", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ locale }),
    });

    return response.ok;
  } catch {
    // localStorage remains the durable offline/pre-login fallback.
    return false;
  }
}

export async function changeAndPersistAppLocale(locale: AppLocale): Promise<void> {
  await changeAppLocale(locale);
  await persistAuthenticatedAppLocale(locale);
}

export async function reconcileAuthenticatedAppLocale(
  remoteLocale: unknown,
  token = browserToken(),
): Promise<AppLocale> {
  if (isAppLocale(typeof remoteLocale === "string" ? remoteLocale : null)) {
    if (normalizeAppLocale(i18n.language) !== remoteLocale) {
      await changeAppLocale(remoteLocale);
    }
    return remoteLocale;
  }

  const localLocale = normalizeAppLocale(i18n.language);
  await persistAuthenticatedAppLocale(localLocale, token);
  return localLocale;
}
