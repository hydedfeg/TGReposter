#!/usr/bin/env node
/**
 * Summarize npm audit JSON without printing full lockfiles or environment
 * variables. Audit results are observations, never automatic upgrades.
 *
 * Usage: node scripts/reportNpmAudit.mjs audit-full.json audit-production.json
 */
import fs from "node:fs";

const [fullPath, productionPath] = process.argv.slice(2);
if (!fullPath || !productionPath) {
  console.error("Two npm audit JSON paths are required.");
  process.exit(2);
}
const severities = ["critical", "high", "moderate", "low", "info"];
function readAudit(file) {
  let data;
  try { data = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { throw new Error("npm audit did not produce valid JSON."); }
  if (data.error || !data.vulnerabilities || !data.metadata?.vulnerabilities) {
    throw new Error("npm audit response is incomplete or has an error.");
  }
  const counts = Object.fromEntries(severities.map(
    level => [level, Number(data.metadata.vulnerabilities[level] ?? 0)]
  ));
  return { counts, vulnerable: data.vulnerabilities };
}
const full = readAudit(fullPath);
const production = readAudit(productionPath);
const affected = Object.entries(full.vulnerable)
  .map(([pkg, entry]) => ({
    pkg, severity: entry.severity,
    direct: Boolean(entry.isDirect),
    fix: entry.fixAvailable === false
      ? "none"
      : typeof entry.fixAvailable === "object"
        ? (entry.fixAvailable.isSemVerMajor ? "breaking" : "available")
        : entry.fixAvailable ? "available" : "unknown",
    production: Object.hasOwn(production.vulnerable, pkg)
  }))
  .sort((a,b) => severities.indexOf(a.severity)-severities.indexOf(b.severity)
    || a.pkg.localeCompare(b.pkg));
const lines = [
  "## TGReposter dependency vulnerability baseline",
  "",
  "This report is informational, not a declaration of safety.",
  "No package was installed or upgraded by the report.",
  "",
  "| Scope | Critical | High | Moderate | Low |",
  "|---|---:|---:|---:|---:|",
  ...[["Full dependency tree", full], ["Production-only", production]].map(([scope, audit]) =>
    `| ${scope} | ${audit.counts.critical} | ${audit.counts.high} | ${audit.counts.moderate} | ${audit.counts.low} |`),
  "",
  "| Package | Severity | Direct | Production affected | Remediation |",
  "|---|---|---|---|---|",
  ...affected.map(({pkg,severity,direct,production,fix}) =>
    `| ${pkg.replaceAll("|","")} | ${severity} | ${direct?"yes":"no"} | ${production?"yes":"no"} | ${fix} |`),
  "",
  "Revalidate and review dependency upgrade and breaking-change risk before commercial launch.",
  "Audit results vary with registry data and run date."
];
const result = lines.join("\n") + "\n";
const destination=process.env.GITHUB_STEP_SUMMARY;
if(destination)fs.appendFileSync(destination,result);
console.log(result);
