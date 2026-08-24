import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("generic AI branding is provider-neutral while provider configuration stays explicit", () => {
  const genericUi = [
    "index.html",
    "src/components/Header.tsx",
    "src/components/CurationFeed.tsx",
    "src/components/AIConfig.tsx",
    "src/App.tsx"
  ].map(readSource).join("\n");

  for (const staleCopy of [
    "My Google AI Studio App",
    "Gemini 3.5 Powered",
    "Gemini AI curation toolbox",
    "AI Curation Toolkit (Gemini 3.5 Flash)",
    "Powered by server-side Gemini 3.5 Flash.",
    "edit posts using Gemini",
    "AI Studio Settings"
  ]) {
    assert.equal(genericUi.includes(staleCopy), false, `Found stale branding: ${staleCopy}`);
  }

  for (const neutralCopy of [
    "TGReposter — Telegram Content Curator",
    "AI Powered",
    "AI Curation Toolkit",
    "Powered by server-side AI.",
    "edit posts using AI",
    "deployment environment&apos;s secrets settings"
  ]) {
    assert.equal(genericUi.includes(neutralCopy), true, `Missing neutral branding: ${neutralCopy}`);
  }

  const providerConfig = readSource("src/components/AIConfig.tsx");
  for (const providerIdentity of [
    "Google Gemini",
    "OpenRouter",
    "GEMINI_API_KEY",
    "OPENROUTER_API_KEY",
    "gemini-3.5-flash"
  ]) {
    assert.equal(
      providerConfig.includes(providerIdentity),
      true,
      `Missing provider configuration identity: ${providerIdentity}`
    );
  }
});
