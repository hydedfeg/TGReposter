# TGReposter Repository Rules

## Non-Negotiable Multilingual Development Rule

TGReposter is a multilingual product. **Every new feature, UI change, workflow change, bug fix that affects user-visible behavior, and product development task must be implemented for all supported interface languages in the same change.**

Supported interface languages:

- English (`en`) — canonical fallback
- Russian (`ru`)
- Arabic (`ar`) — RTL
- Persian / Farsi (`fa`) — RTL

A change is **not complete** if it works or appears correctly in only one language.

### Required for every user-facing change

1. Add or update translation keys for **all four locales** in the same pull request.
2. Never hard-code user-facing strings in React components when the text belongs in i18n resources.
3. Keep translation key structure identical across `en`, `ru`, `ar`, and `fa`.
4. Preserve English as the fallback language, but do not rely on fallback as a substitute for Russian, Arabic, or Persian translations.
5. Verify RTL behavior for Arabic and Persian.
   - Use logical CSS/Tailwind utilities such as `start/end`, `ps/pe`, `ms/me`.
   - Avoid physical inline-direction utilities such as `left/right`, `pl/pr`, `ml/mr`, and `text-left/text-right` in multilingual surfaces.
   - Mirror directional icons where appropriate.
6. Use `dir="auto"` for Telegram content, AI-generated content, user-entered mixed-language text, and dynamic backend messages when their direction cannot be assumed from the UI locale.
7. Keep technical identifiers LTR where appropriate, including URLs, Telegram IDs, usernames, bot IDs, post IDs, model IDs, cron expressions, and database identifiers.
8. Localize locale-sensitive dates, numbers, percentages, counts, and plural forms with the selected interface locale.
9. Do not translate or localize backend machine values, enums, IDs, API codes, status codes, or stable AI action/language identifiers. Translate only their display labels.
10. UI language must remain independent from:
    - Telegram/source content language
    - AI output/translation language
11. Marketing/public pages and authenticated dashboard surfaces follow the same multilingual requirement.
12. Known backend/API failures shown to users should use stable error codes mapped to localized frontend messages whenever practical. Raw diagnostic text may remain verbatim when it is not a stable product message.

### Testing requirements

Every multilingual change must keep or add tests that verify the relevant behavior. At minimum:

- EN/RU/AR/FA translation key parity remains intact.
- New visible copy exists in all four languages.
- RTL-safe layout rules remain intact.
- Machine values remain separate from translated labels.
- Mixed-direction content remains safe.
- `npm run lint` and `npm run build` pass before merge.

The repository's i18n completeness tests are a required regression gate. Do not weaken or bypass them to make a change pass.

### Definition of done

For any user-visible feature or fix, "done" means:

> The feature works correctly in English, Russian, Arabic, and Persian, including RTL behavior where applicable, with tests passing in the same change.

If a feature cannot be completed for all supported languages in the same change, it should not be merged as complete.
