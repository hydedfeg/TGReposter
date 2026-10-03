import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(resolve(root, "src/index.css"), "utf8");

test("loads dedicated Arabic and Persian UI font families", () => {
  assert.match(css, /family=Noto\+Sans\+Arabic/);
  assert.match(css, /family=Vazirmatn/);
});

test("Arabic uses Noto Sans Arabic for interface and display typography", () => {
  assert.match(
    css,
    /html\[lang="ar"\][\s\S]*?--font-sans:\s*"Noto Sans Arabic"/,
  );
  assert.match(
    css,
    /html\[lang="ar"\][\s\S]*?--font-display:\s*"Noto Sans Arabic"/,
  );
});

test("Persian uses Vazirmatn for interface and display typography", () => {
  assert.match(
    css,
    /html\[lang="fa"\][\s\S]*?--font-sans:\s*"Vazirmatn"/,
  );
  assert.match(
    css,
    /html\[lang="fa"\][\s\S]*?--font-display:\s*"Vazirmatn"/,
  );
});

test("technical monospace typography stays on JetBrains Mono", () => {
  assert.match(css, /--font-mono:\s*"JetBrains Mono"/);
});

test("Arabic-script locales neutralize Latin-oriented tracking utilities", () => {
  assert.match(css, /html\[lang="ar"\] \[class\*="tracking-"\]/);
  assert.match(css, /html\[lang="fa"\] \[class\*="tracking-"\]/);
  assert.match(css, /letter-spacing:\s*normal/);
});
