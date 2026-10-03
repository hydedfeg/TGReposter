import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const rtlAuditedFiles = [
  "src/components/AppShell.tsx",
  "src/components/Login.tsx",
  "src/components/Dashboard.tsx",
  "src/components/CurationFeed.tsx",
  "src/components/SourceChannelsConfig.tsx",
  "src/components/FilterConfig.tsx",
  "src/components/DestinationConfig.tsx",
  "src/components/AIConfig.tsx",
  "src/components/UserManagement.tsx",
  "src/components/DatabaseConfig.tsx",
];

const physicalUtilityPattern =
  /(?:^|[\s"'])(?:[a-z]+:)*(?:left|right|pl|pr|ml|mr)-[^\s"'}]+|\btext-(?:left|right)\b/g;

test("RTL-audited dashboard files use logical inline layout utilities", () => {
  for (const relativePath of rtlAuditedFiles) {
    const source = readFileSync(resolve(root, relativePath), "utf8");
    const matches = source.match(physicalUtilityPattern) ?? [];

    assert.deepEqual(
      matches,
      [],
      relativePath + " contains physical inline-direction utilities: " + matches.join(", "),
    );
  }
});

test("the shared shell uses inline-start positioning and padding", () => {
  const source = readFileSync(resolve(root, "src/components/AppShell.tsx"), "utf8");

  assert.match(source, /\bstart-0\b/);
  assert.match(source, /\blg:ps-64\b/);
  assert.match(source, /\btext-start\b/);
});

test("directional icons are mirrored when the document is RTL", () => {
  const css = readFileSync(resolve(root, "src/index.css"), "utf8");

  assert.match(css, /html\[dir="rtl"\] \.rtl-mirror/);
  assert.match(css, /transform:\s*scaleX\(-1\)/);
});
