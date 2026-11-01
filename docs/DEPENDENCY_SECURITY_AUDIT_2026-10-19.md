# Dependency security audit — 2026-10-19 (staging)

## Scope and evidence

Audited the pinned `package-lock.json` on branch
`feat/dependency-security-audit` using Node.js 22,
`npm ci`, `npm audit --json`, and an isolated GitHub Actions runner.

The initial audit identified **9 advisories (1 critical, 3 high,
5 moderate)**. No low severity findings were reported.

| Package | Severity | Old version | Fixed version |
| --- | --- | --- | --- |
| proxy-addr | Critical | 2.0.7 | 2.0.8 |
| browserslist | High | 4.28.6 | 4.29.4 |
| nanoid | High | 3.3.16 | 3.3.20 |
| source-map-js | High | 1.2.1 | 1.2.2 |
| baseline-browser-mapping | Moderate | 2.10.44 | 2.11.29 |
| body-parser | Moderate | 1.20.6 | 1.20.8 |
| express | Moderate | 4.22.2 | 4.22.3 |
| postcss | Moderate | 8.5.20 | 8.5.31 |
| qs | Moderate | 6.15.3 | 6.16.1 |

The `proxy-addr` advisory covers IPv4-mapped IPv6 trusted proxy
IP spoofing ([GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h)).

## Safe remediation

Applied `npm audit fix --package-lock-only --ignore-scripts --audit=false`
on a temporary GitHub Actions runner, then performed a clean `npm ci`
installation, `npm audit --audit-level=moderate`, the TypeScript check,
and the entire regression/build pipeline **before committing** the updated
lockfile. `npm audit` reported **0 vulnerabilities**, and all **466**
automated tests passed.

`package.json` is unchanged and there is no intentional major-version
application dependency upgrade. Besides the affected libraries, npm
refreshed several related transitive browser support packages and added
nested WASM-runtime entries in `package-lock.json`.

The temporary repair workflow had `contents: write` only on the
isolated security branch and was removed after the verified lockfile
was committed. The permanent CI workflow retains read-only
permissions and runs `npm audit --audit-level=moderate` to prevent
known moderate-or-worse dependency regressions.

## Remaining boundaries

- This audit does not prove the application has no exploitable vulnerabilities.
  It covers npm's published advisories for installed dependencies at audit time.
- Check new dependency advisories regularly and review the exposed proxy
  trust configuration separately.
- Staging-only release; do not modify production or enable customer crypto
  payments, AI subscriptions or automatic Telegram notifications without
  separate authorization.
