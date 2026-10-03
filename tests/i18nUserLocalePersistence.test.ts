import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("profile UI locale migration is nullable, constrained, and does not broaden client writes", () => {
  const migration = readFileSync(
    resolve(root, "supabase/migrations/20260929161219_persist_user_ui_locale.sql"),
    "utf8",
  );
  const profileSecurity = readFileSync(
    resolve(root, "supabase/migrations/20260905125947_restrict_profile_mutations.sql"),
    "utf8",
  );

  assert.match(migration, /add column if not exists ui_locale text/i);
  assert.match(migration, /ui_locale is null/i);
  for (const locale of ["en", "ru", "ar", "fa"]) {
    assert.match(migration, new RegExp(`'${locale}'::text`));
  }
  assert.doesNotMatch(migration, /ui_locale[^;]*default/i);

  assert.match(profileSecurity, /grant select on table public\.profiles to authenticated/i);
  assert.doesNotMatch(
    profileSecurity,
    /grant[^;]*\b(?:insert|update|delete)\b[^;]*\bto authenticated\b/i,
  );
});

test("backend auth profiles carry and persist only supported UI locales", () => {
  const service = readFileSync(resolve(root, "server/services/appAuthService.ts"), "utf8");

  assert.match(service, /AppUiLocale = "en" \| "ru" \| "ar" \| "fa"/);
  assert.match(service, /select id, email, full_name, role, is_active, ui_locale/);
  assert.match(service, /uiLocale: normalizeStoredUiLocale\(profile\.ui_locale\)/);
  assert.match(service, /updateSupabaseAppUserUiLocale/);
  assert.match(service, /set ui_locale = \$2/);
  assert.match(service, /where id = \$1::uuid[\s\S]*and is_active = true/);
  assert.doesNotMatch(
    service.match(/updateSupabaseAppUserUiLocale[\s\S]*?return savedLocale;/)?.[0] ?? "",
    /set\s+(?:role|is_active|email|full_name)\s*=/,
  );
});

test("auth API exposes and updates the per-user UI locale behind authentication", () => {
  const server = readFileSync(resolve(root, "server.ts"), "utf8");

  assert.match(server, /uiLocale: session\?\.uiLocale \?\? null/);
  assert.match(server, /uiLocale: result\.user\.uiLocale/);
  assert.match(server, /app\.put\("\/api\/auth\/ui-locale", authMiddleware/);
  assert.match(server, /if \(!isAppUiLocale\(locale\)\)/);
  assert.match(server, /req\.user\?\.authProvider !== "supabase"/);
  assert.match(server, /updateSupabaseAppUserUiLocale\(req\.user\.id, locale\)/);
});

test("language selector keeps local changes immediate and syncs authenticated changes", () => {
  const selector = readFileSync(resolve(root, "src/components/LanguageSelector.tsx"), "utf8");
  const preference = readFileSync(resolve(root, "src/i18n/userLocalePreference.ts"), "utf8");

  assert.match(selector, /changeAndPersistAppLocale\(normalizeAppLocale\(event\.target\.value\)\)/);
  assert.match(preference, /await changeAppLocale\(locale\)/);
  assert.match(preference, /fetch\("\/api\/auth\/ui-locale"/);
  assert.match(preference, /method: "PUT"/);
  assert.match(preference, /Authorization:/);
  assert.match(preference, /Bearer/);
  assert.match(preference, /if \(!token \|\| typeof fetch === "undefined"\) return Promise\.resolve\(false\)/);
  assert.match(preference, /localePersistenceQueue = localePersistenceQueue/);
});

test("authenticated bootstrap restores remote locale or seeds a null preference from local state", () => {
  const preference = readFileSync(resolve(root, "src/i18n/userLocalePreference.ts"), "utf8");
  const app = readFileSync(resolve(root, "src/App.tsx"), "utf8");
  const promotion = readFileSync(resolve(root, "src/PromotionPage.tsx"), "utf8");
  const login = readFileSync(resolve(root, "src/components/Login.tsx"), "utf8");

  assert.match(preference, /typeof remoteLocale === "string" && isAppLocale\(remoteLocale\)/);
  assert.match(preference, /if \(storedLocale\)/);
  assert.match(preference, /await changeAppLocale\(storedLocale\)/);
  assert.match(preference, /const localLocale = normalizeAppLocale\(i18n\.language\)/);
  assert.match(preference, /await persistAuthenticatedAppLocale\(localLocale, token\)/);

  assert.match(app, /reconcileAuthenticatedAppLocale\(data\.uiLocale, savedToken\)/);
  assert.match(app, /reconcileAuthenticatedAppLocale\(uiLocale, token\)/);
  assert.match(promotion, /reconcileAuthenticatedAppLocale\(authData\.uiLocale, token\)/);
  assert.match(login, /data\.uiLocale \?\? null/);
});

test("UI locale remains separate from Telegram content and AI output language", () => {
  const migration = readFileSync(
    resolve(root, "supabase/migrations/20260929161219_persist_user_ui_locale.sql"),
    "utf8",
  );
  const aiStudio = readFileSync(resolve(root, "src/components/PromotionAIStudio.tsx"), "utf8");

  assert.match(migration, /Independent from Telegram content and AI output language/i);
  assert.match(aiStudio, /const \[outputLanguage, setOutputLanguage\] = useState<AIOutputLanguageId>\("en"\)/);
  assert.match(aiStudio, /outputLanguage,/);
  assert.match(aiStudio, /common:aiLanguages\.\$\{languageId\}/);
});
