# UI Quality Workflow

TGReposter uses a repository-local design-engineering workflow built around the selected skills in `.agents/skills/`.

## Default workflow

For a normal UI change:

1. Preserve the four-locale EN/RU/AR/FA contract and RTL behavior.
2. Use `emil-design-eng` as the general craft/review bar.
3. If the surface is mobile-facing, apply `mobile-native`.
4. Stress realistic data with `break-ui` before calling a data-heavy layout robust.
5. If a redesign has multiple plausible answers, explore it with `prototype` outside production code before selecting a direction.
6. For motion, first use `find-animation-opportunities`; implement surviving motion with `animate`; finish with `review-animations`.
7. If new UI infrastructure is needed, consult `pick-ui-library` before adding a dependency.

## Product posture

The authenticated dashboard is a high-frequency productivity tool. Motion should primarily communicate state, spatial relationships, or feedback. Avoid decorative animation in repeated navigation and review workflows.

The public marketing site can carry more explanatory motion, but it must remain fast, responsive, accessible, and respectful of reduced-motion preferences.

## Required stress cases

Where applicable, validate:

- 320px mobile width and the real component container width
- coarse/touch pointers
- iOS-style safe areas and browser chrome
- software-keyboard-facing forms
- 200% browser zoom
- English, Russian, Arabic, and Persian
- LTR and RTL
- long Telegram usernames, URLs, titles, emails, model IDs, and translated labels
- zero, one, and large counts
- empty, loading, error, success, and missing-optional-data states
- large lists before assuming direct rendering will remain smooth

## Dependency discipline

The vendored skills are guidance, not a dependency mandate. Reuse the current stack first. TGReposter already ships React, Tailwind, Lucide, i18next, and Motion. Add another UI library only when it materially improves accessibility, reliability, or maintainability.

## Mobile baseline introduced with this workflow

The first adoption pass also hardens the application with:

- `viewport-fit=cover` and software-keyboard-aware viewport metadata
- transparent mobile tap highlight
- `touch-action: manipulation` for interactive controls
- selection/callout suppression for controls, not content
- a 16px coarse-pointer input floor to prevent iOS focus zoom
- dynamic viewport height for the workspace shell
- safe-area-aware workspace header and mobile “More” sheet
- grapheme-aware user initials for non-Latin names and emoji
