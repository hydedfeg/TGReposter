import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ownerPrincipalForUser } from "../server/services/userPrincipalService";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverSource = fs.readFileSync(path.join(repoRoot, "server.ts"), "utf8");
const inboxRepositorySource = fs.readFileSync(
  path.join(repoRoot, "server/repositories/userInboxRepository.ts"),
  "utf8"
);
const migrationSource = fs.readFileSync(
  path.join(repoRoot, "supabase/migrations/20260902183000_scope_content_inbox_by_user.sql"),
  "utf8"
);

test("different authenticated users receive different Content Inbox owner principals", () => {
  const first = ownerPrincipalForUser({
    id: "11111111-1111-1111-1111-111111111111",
    username: "first@example.com",
    authProvider: "supabase",
  });
  const second = ownerPrincipalForUser({
    id: "22222222-2222-2222-2222-222222222222",
    username: "second@example.com",
    authProvider: "supabase",
  });

  assert.notEqual(first, second);
  assert.equal(first, "supabase:11111111-1111-1111-1111-111111111111");
  assert.equal(second, "supabase:22222222-2222-2222-2222-222222222222");
});

test("Content Inbox reads and writes are routed through authenticated user-scoped services", () => {
  assert.match(serverSource, /getUserInboxPosts\(req\.user\)/);
  assert.match(serverSource, /saveUserInboxPosts\(req\.user, incoming\.posts\)/);
  assert.match(serverSource, /getUserInboxPost\(req\.user, String\(postId/);
  assert.match(serverSource, /saveUserInboxPosts\(req\.user, \[responsePost\]\)/);
});

test("inbox repository scopes every personalized row by owner principal", () => {
  assert.match(inboxRepositorySource, /ui\.owner_principal = \$1/);
  assert.match(inboxRepositorySource, /owner_principal, post_id/);
  assert.match(inboxRepositorySource, /on conflict \(owner_principal, post_id\)/);
});

test("Content Inbox migration separates canonical posts from private workflow state", () => {
  assert.match(migrationSource, /create table if not exists public\.user_inbox_items/);
  assert.match(migrationSource, /primary key \(owner_principal, post_id\)/);
  assert.match(migrationSource, /alter table public\.user_inbox_items enable row level security/);
  assert.match(migrationSource, /ui\.status in \('approved', 'posted'\)/);
});
