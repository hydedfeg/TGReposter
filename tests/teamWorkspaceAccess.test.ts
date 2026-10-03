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
const englishTeamSource = fs.readFileSync(
  path.join(repoRoot, "src/i18n/locales/en/team.ts"),
  "utf8"
);
const englishNavigationSource = fs.readFileSync(
  path.join(repoRoot, "src/i18n/locales/en/navigation.ts"),
  "utf8"
);
const serverSource = fs.readFileSync(path.join(repoRoot, "server.ts"), "utf8");

test("Team explains the new private workspace ownership model", () => {
  assert.match(teamSource, /useTranslation\("team"\)/);
  assert.match(teamSource, /t\("header\.title"\)/);
  assert.match(teamSource, /t\("isolation\.inboxTitle"\)/);
  assert.match(teamSource, /t\("isolation\.destinationsTitle"\)/);
  assert.match(teamSource, /t\("isolation\.setupTitle"\)/);
  assert.match(teamSource, /t\("members\.isolationEnabled"\)/);

  assert.match(englishTeamSource, /title: "Team & Workspace Access"/);
  assert.match(englishTeamSource, /inboxTitle: "Private Content Inbox"/);
  assert.match(englishTeamSource, /destinationsTitle: "Private Destinations"/);
  assert.match(englishTeamSource, /setupTitle: "Private Curation Setup"/);
  assert.match(englishTeamSource, /Sources, Filters, AI Configuration, monitored posts/);
  assert.match(englishTeamSource, /isolationEnabled: "Personal workspace isolation enabled"/);
});

test("new production team members are provisioned with durable Supabase identities", () => {
  assert.match(teamSource, /type="email"/);
  assert.match(teamSource, /t\("form\.description"\)/);
  assert.match(englishTeamSource, /New accounts use Supabase Auth/);
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

test("navigation reflects the workspace access model through i18n keys", () => {
  assert.match(appShellSource, /labelKey: "items\.sources"/);
  assert.match(appShellSource, /labelKey: "items\.filters"/);
  assert.match(appShellSource, /labelKey: "items\.aiConfiguration"/);
  assert.match(appShellSource, /labelKey: "items\.teamAccess"/);
  assert.match(appShellSource, /team: "titles\.team"/);
  assert.match(appShellSource, /t\("account\.personalWorkspace"\)/);

  assert.match(englishNavigationSource, /sources: "My Sources"/);
  assert.match(englishNavigationSource, /filters: "My Filters"/);
  assert.match(englishNavigationSource, /aiConfiguration: "My AI Configuration"/);
  assert.match(englishNavigationSource, /teamAccess: "Team & Access"/);
  assert.match(englishNavigationSource, /team: "Team & Access"/);
  assert.match(englishNavigationSource, /personalWorkspace: "Personal workspace"/);
});
