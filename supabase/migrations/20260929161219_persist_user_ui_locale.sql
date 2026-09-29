-- Persist each Supabase-authenticated member's interface language without
-- changing the existing backend-owned profile mutation model.
--
-- ui_locale is intentionally nullable. A null value means the account has not
-- stored a cross-device UI preference yet, so the browser's existing
-- tgreposter-locale value may seed it after the next authenticated session.
-- This preference is independent from Telegram content language and AI output
-- language.

alter table public.profiles
  add column if not exists ui_locale text;

alter table public.profiles
  drop constraint if exists profiles_ui_locale_check;

alter table public.profiles
  add constraint profiles_ui_locale_check
  check (
    ui_locale is null
    or ui_locale = any (array['en'::text, 'ru'::text, 'ar'::text, 'fa'::text])
  );

comment on column public.profiles.ui_locale is
  'Authenticated user interface locale preference. Null means no cross-device preference has been stored yet. Independent from Telegram content and AI output language.';
