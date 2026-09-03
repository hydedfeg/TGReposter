import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const teamSource = fs.readFileSync(
  path.join(repoRoot, "src/components/UserManagement.tsx"),
  "utf8"
);
const appShellSource = fs.readFileSync(
  path.join(repoRoot, "src/components/AppShell.tsx"),
  "utf8"
);
const serverSource = fs.readFileSync(path.join(repoRoot, "server.ts"), "utf8");

test("Team explains complete private application workspaces", () => {
  assert.match(teamSource, /Team & Workspace Access/);
  assert.match(teamSource, /Private Content & Sources/);
  assert.match(teamSource, /Private Publishing & Promotions/);
  assert.match(teamSource, /Administrative Controls Only/);
  assert.match(teamSource, /fully isolated workspace/i);
  assert.doesNotMatch(teamSource, /Shared System Setup/);
  assert.doesNotMatch(teamSource, /shared sources/i);
});

test("new production team members are provisioned with durable Supabase identities", () => {
  assert.match(teamSource, /type="email"/);
  assert.match(teamSource, /New accounts use Supabase Auth/);
  assert.match(
    serverSource,
    /New production workspace members require an email-based Supabase Auth account/
  );
  assert.match(serverSource, /process\.env\.DATABASE_URL && !identity\.includes\("@"\)/);
});

test("revoking a legacy member preserves their personal workspace identity", () => {
  assert.match(serverSource, /userToDelete\.isActive = false/);
  assert.match(serverSource, /Personal workspace data was retained/);
  assert.match(
    serverSource,
    /u\.username === checkUser && u\.isActive !== false/
  );
});

test("navigation exposes personal configuration to every user", () => {
  assert.match(appShellSource, /label: "My Sources"/);
  assert.match(appShellSource, /label: "My Filters"/);
  assert.match(appShellSource, /label: "My Destinations"/);
  assert.match(appShellSource, /label: "My AI Configuration"/);
  assert.match(appShellSource, /label: "Team & Access"/);
  assert.match(appShellSource, /team: "Team & Access"/);
});
