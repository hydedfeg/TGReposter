import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("promotion workspace is reachable through an isolated authenticated hash route", () => {
  const main = read("src/main.tsx");
  const header = read("src/components/Header.tsx");
  const page = read("src/PromotionPage.tsx");

  assert.match(main, /hash === '#promotion'/);
  assert.match(header, /Open Promotion Center/);
  assert.match(page, /\/api\/auth\/status/);
  assert.match(page, /curator_token/);
});

test("promotion dashboard launches campaigns and retries failed deliveries through Step 4 APIs", () => {
  const workspace = read("src/components/PromotionWorkspace.tsx");

  assert.match(workspace, /\/api\/promotion\/campaigns\/\$\{detail\.campaign\.id\}\/launch/);
  assert.match(workspace, /\/api\/promotion\/campaigns\/\$\{detail\.campaign\.id\}\/retry/);
  assert.match(workspace, /connectionStatus === "ok"/);
  assert.match(workspace, /Retry all failed/);
});

test("promotion frontend never handles raw Telegram bot tokens", () => {
  const workspace = read("src/components/PromotionWorkspace.tsx");
  const page = read("src/PromotionPage.tsx");

  assert.equal(workspace.includes("botToken"), false);
  assert.equal(page.includes("botToken"), false);
  assert.match(workspace, /botAccount\?\.name/);
});
