import i18n, { changeAppLocale, normalizeAppLocale, type AppLocale } from "./index";
import { isAppLocale } from "./locales";

let localePersistenceQueue: Promise<void> = Promise.resolve();

function browserToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem("curator_token")?.trim() || "";
  } catch {
    return "";
  }
}

export function persistAuthenticatedAppLocale(
  locale: AppLocale,
  token = browserToken(),
): Promise<boolean> {
  if (!token || typeof fetch === "undefined") return Promise.resolve(false);

  let resolveResult: (value: boolean) => void = () => {};
  const result = new Promise<boolean>((resolve) => {
    resolveResult = resolve;
  });

  localePersistenceQueue = localePersistenceQueue
    .catch(() => undefined)
    .then(async () => {
      try {
        const response = await fetch("/api/auth/ui-locale", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ locale }),
        });
        resolveResult(response.ok);
      } catch {
        // localStorage remains the durable offline/pre-login fallback.
        resolveResult(false);
      }
    });

  return result;
}

export async function changeAndPersistAppLocale(locale: AppLocale): Promise<void> {
  await changeAppLocale(locale);
  await persistAuthenticatedAppLocale(locale);
}

export async function reconcileAuthenticatedAppLocale(
  remoteLocale: unknown,
  token = browserToken(),
): Promise<AppLocale> {
  const storedLocale =
    typeof remoteLocale === "string" && isAppLocale(remoteLocale)
      ? remoteLocale
      : null;

  if (storedLocale) {
    if (normalizeAppLocale(i18n.language) !== storedLocale) {
      await changeAppLocale(storedLocale);
    }
    return storedLocale;
  }

  const localLocale = normalizeAppLocale(i18n.language);
  await persistAuthenticatedAppLocale(localLocale, token);
  return localLocale;
}
