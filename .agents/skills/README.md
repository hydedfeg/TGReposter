# TGReposter UI Agent Skills

This directory vendors a deliberately selected subset of [emilkowalski/skills](https://github.com/emilkowalski/skills) for repository-local design and UI engineering guidance.

Upstream revision: `e8a175de22ae1e49370fc144c1f3bb9aeedf988d`

Selected skills:

- `emil-design-eng` — UI polish and design-engineering review
- `mobile-native` — mobile-web platform hardening
- `break-ui` — realistic worst-case UI stress testing
- `prototype` — isolated divergent design exploration
- `find-animation-opportunities` — decide where motion is actually useful
- `animate` — implement deliberate motion
- `review-animations` — strict motion review
- `pick-ui-library` — choose mature UI libraries when a dependency is justified

These files are development instructions only. They are not imported by the application and add no browser/server runtime dependency.

TGReposter-specific routing and constraints live in the repository root `AGENTS.md`. If upstream advice conflicts with TGReposter's security, multilingual, RTL, accessibility, or product requirements, TGReposter's repository rules take precedence.

## Updating

Review upstream changes before updating rather than blindly replacing the local copies. The source project also supports the Skills CLI:

```bash
npx skills@latest add emilkowalski/skills
```

Keep only skills relevant to this project, and preserve the upstream MIT license in this directory.
