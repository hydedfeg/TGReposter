## Summary

<!-- What changed and why? -->

## Multilingual requirement

TGReposter changes must be complete in **English, Russian, Arabic, and Persian** before merge.

- [ ] This change has no user-visible behavior/text, **or** all user-visible changes are implemented in EN/RU/AR/FA.
- [ ] Translation keys are present and structurally consistent across all four locales.
- [ ] No new user-facing strings are hard-coded outside i18n resources.
- [ ] Arabic and Persian RTL behavior was checked for affected UI.
- [ ] Mixed Telegram/AI/user content uses appropriate direction handling such as `dir="auto"`.
- [ ] Technical IDs/URLs/usernames remain LTR where appropriate.
- [ ] Locale-sensitive dates, numbers, counts, and plurals are localized where applicable.
- [ ] Stable backend/API/AI machine values remain independent from translated display labels.
- [ ] UI language remains independent from Telegram content language and AI output language.

## Validation

- [ ] Relevant tests added/updated.
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.
- [ ] i18n completeness/parity tests pass.
