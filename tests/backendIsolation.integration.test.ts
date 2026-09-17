import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { Client } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const root = path.resolve(import.meta.dirname, "..");
const aliceId = "11111111-1111-4111-8111-111111111111";
const bobId = "22222222-2222-4222-8222-222222222222";
const owner = (id: string) => `supabase:${id}`;
const bot = (user: string) => `123456:${user.padEnd(24, "X")}`;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function stop(child?: ChildProcess) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([new Promise(resolve => child.once("exit", resolve)), delay(2000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
}
async function freePort() {
  const socket = net.createServer();
  await new Promise<void>(resolve => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as net.AddressInfo).port;
  await new Promise<void>(resolve => socket.close(() => resolve()));
  return port;
}

test("PostgreSQL backend isolates two authenticated workspaces", { timeout: 90_000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "tgreposter-tenant-test-"));
  // PostgreSQL runs in-process, with a wire-protocol server used by the real pg
  // driver. No inherited DATABASE_URL or production credentials are used.
  const engine = await PGlite.create({ extensions: { pgcrypto } });
  const port = await freePort();
  const socket = new PGLiteSocketServer({ db: engine, host: "127.0.0.1", port, maxConnections: 16 });
  await socket.start();
  let app: ChildProcess | undefined;
  let db: Client | undefined;
  let logs = "";
  const capture = (child: ChildProcess) => {
    child.stdout?.on("data", data => { logs += data; });
    child.stderr?.on("data", data => { logs += data; });
    return child;
  };
  t.after(async () => {
    await stop(app);
    await db?.end();
    await socket.stop();
    await engine.close();
    await fs.rm(temp, { recursive: true, force: true });
  });
  const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
  db = new Client({ connectionString: databaseUrl });
  await db.connect();
  await db.query(await fs.readFile(path.join(root, "tests/tenantPlatform.fixture.sql"), "utf8"));
  const migrations = (await fs.readdir(path.join(root, "supabase/migrations"))).filter(file => file.endsWith(".sql")).sort();
  for (const migration of migrations) {
    let sql = await fs.readFile(path.join(root, "supabase/migrations", migration), "utf8");
    // pg_net is Supabase infrastructure. Cron statements are registered in the
    // fixture but never executed. All application DDL is applied unchanged.
    sql = sql.replace(/^(?:create|drop) extension if (?:not )?exists (?:pg_net|pg_cron)[^;]*;/gim, "");
    try { await db.query(sql); }
    catch (error) { throw new Error(`Migration ${migration}: ${String(error)}`); }
  }
  await db.query("insert into auth.users(id,email) values($1,'alice@example.test'),($2,'bob@example.test')", [aliceId, bobId]);
  await db.query("update public.profiles set is_active=true, full_name=case id when $1 then 'Alice' else 'Bob' end, role=case id when $1 then 'super-admin' else 'admin' end", [aliceId]);
  await fs.symlink(path.join(root, "node_modules"), path.join(temp, "node_modules"), "dir");
  app = capture(spawn(process.execPath, ["--import", "tsx", "--import", path.join(root, "tests/mockTenantExternal.ts"), path.join(root, "server.ts")], {
    cwd: temp, stdio: ["ignore", "pipe", "pipe"],
    env: { PATH: process.env.PATH, NODE_ENV: "production", DATABASE_URL: databaseUrl,
      SUPABASE_URL: "https://tenant-auth.invalid", SUPABASE_ANON_KEY: "test-key",
      OPENROUTER_API_KEY: "test-ai-key", TELEGRAM_RATE_LIMIT_DISABLED: "true" },
  }));
  const api = async (token: string | null, url: string, body?: unknown, method = body === undefined ? "GET" : "POST") => {
    const response = await fetch(`http://127.0.0.1:3000${url}`, {
      method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(8000),
    });
    return { status: response.status, data: await response.json() as any };
  };
  for (let attempt = 0; attempt < 100; attempt++) {
    if (app.exitCode !== null) throw new Error(logs);
    if (logs.includes("Telegram Content Curator running on")) break;
    if (attempt === 99) throw new Error(`Test server failed to start: ${logs}`);
    await delay(50);
  }
  const ok = async (promise: ReturnType<typeof api>, expected = 200) => {
    const result = await promise;
    assert.equal(result.status, expected, JSON.stringify(result.data));
    return result.data;
  };
  const outbound = async () => {
    const text = await fs.readFile(path.join(temp, "tenant-outbound.jsonl"), "utf8").catch(() => "");
    return text.trim() ? text.trim().split("\n").map(line => JSON.parse(line)) : [];
  };
  const alice = (await ok(api(null, "/api/auth/login", { username: "alice@example.test", password: "test-password" }))).token;
  const bobLogin = await ok(api(null, "/api/auth/login", { username: "bob@example.test", password: "test-password" }));
  const bob = bobLogin.token;

  await t.test("sessions use database roles and reject missing/forged tokens", async () => {
    assert.equal(bobLogin.role, "admin");
    for (const token of [null, "forged-token"]) {
      for (const route of ["/api/settings", "/api/channels", "/api/promotion/campaigns"]) {
        assert.equal((await api(token, route)).status, 401);
      }
    }
    assert.equal((await api(bob, "/api/users/add", { username: "mallory", password: "test-password", role: "super-admin" })).status, 403);
  });

  await t.test("sources, filters, AI preferences and duplicate Telegram posts remain independent", async () => {
    for (const [token, name] of [[alice, "alice"], [bob, "bob"]]) {
      await ok(api(token, "/api/settings", {
        ownerPrincipal: owner(aliceId), owner_principal: owner(aliceId),
        channels: [{ username: "shared", name: `${name} source`, enabled: true }],
        filters: { positiveKeywords: [], negativeKeywords: [name], requiredHashtags: [], caseSensitive: false },
        aiConfig: { provider: "openrouter", model: `${name}-model` },
      }));
      await ok(api(token, "/api/fetch-posts", { usernames: ["shared"], ownerPrincipal: owner(aliceId) }));
    }
    const rows = await db!.query("select owner_principal from posts where id='shared/1'");
    assert.equal(rows.rowCount, 2);
    for (const [token, name] of [[alice, "alice"], [bob, "bob"]]) {
      const data = await ok(api(token, "/api/settings"));
      assert.equal(data.channels[0].name, `${name} source`);
      assert.deepEqual(data.filters.negativeKeywords, [name]);
      assert.equal(data.aiConfig.model, `${name}-model`);
      assert.equal(data.posts.length, 1);
    }
    await ok(api(bob, "/api/channels/shared", undefined, "DELETE"));
    assert.equal((await ok(api(alice, "/api/channels"))).length, 1);
    assert.equal((await ok(api(bob, "/api/channels"))).length, 0);
  });

  await t.test("editing one inbox cannot alter another user's same-ID post or inject foreign IDs", async () => {
    await db!.query("insert into posts(owner_principal,id,channel_username,original_text,published_at) values($1,'alice-only/1','alice-only','Alice private',now())", [owner(aliceId)]);
    await ok(api(alice, "/api/settings", { posts: [{ id: "shared/1", text: "Alice edit", status: "approved" }] }));
    await ok(api(bob, "/api/settings", { posts: [{ id: "shared/1", text: "Bob edit", status: "pending" }], ownerPrincipal: owner(aliceId) }));
    const denied = await api(bob, "/api/settings", { posts: [{ id: "alice-only/1", text: "Stolen", status: "posted" }] });
    assert.equal(denied.status, 400);
    const a = await ok(api(alice, "/api/settings"));
    const b = await ok(api(bob, "/api/settings"));
    assert.equal(a.posts.find((p: any) => p.id === "shared/1").text, "Alice edit");
    assert.equal(b.posts[0].text, "Bob edit");
    assert.equal(b.posts.some((p: any) => p.id === "alice-only/1"), false);
    assert.equal(b.users, undefined);
  });

  await t.test("destination IDs, credential writes and reposting use only the session owner", async () => {
    let count = (await outbound()).length;
    const unconfiguredPendingPublish = await api(bob, "/api/post-telegram", {
      postId: "shared/1",
      targetIds: ["same-target"],
    });
    assert.equal(unconfiguredPendingPublish.status, 409);
    assert.equal(unconfiguredPendingPublish.data.code, "POST_NOT_APPROVED");
    assert.equal((await outbound()).length, count);

    for (const [token, name] of [[alice, "alice"], [bob, "bob"]]) {
      await ok(api(token, "/api/destination/bot-token", { botToken: bot(name), ownerPrincipal: owner(aliceId) }));
      await ok(api(token, "/api/settings", { destination: { targets: [
        { id: "same-target", name, channelId: `@${name}`, enabled: true },
        ...(name === "alice" ? [{ id: "alice-only", name, channelId: "@alice-only", enabled: true }] : []),
      ] } }));
    }
    count = (await outbound()).length;
    assert.equal((await api(bob, "/api/post-telegram", { postId: "alice-only/1", targetIds: ["same-target"] })).status, 404);
    assert.equal((await outbound()).length, count);

    const pendingPublish = await api(bob, "/api/post-telegram", {
      postId: "shared/1",
      text: "Bob publishes",
      targetIds: ["same-target"],
    });
    assert.equal(pendingPublish.status, 409);
    assert.equal(pendingPublish.data.code, "POST_NOT_APPROVED");
    assert.equal((await outbound()).length, count);

    await ok(api(bob, "/api/settings", {
      posts: [{ id: "shared/1", text: "Bob publishes", status: "approved" }],
    }));
    assert.equal((await api(bob, "/api/post-telegram", { postId: "shared/1", targetIds: ["alice-only"] })).status, 400);
    assert.equal((await outbound()).length, count);
    await ok(api(bob, "/api/post-telegram", { postId: "shared/1", text: "Bob publishes", targetIds: ["same-target"], ownerPrincipal: owner(aliceId) }));
    const sends = (await outbound()).slice(count);
    assert.ok(sends.length > 0);
    assert.ok(sends.every(call => call.botToken === bot("bob") && call.body.chat_id === "@bob"));
    const a = await ok(api(alice, "/api/settings"));
    assert.equal(a.posts.find((p: any) => p.id === "shared/1").status, "approved");
    assert.equal(a.destination.targets.length, 2);
    assert.equal(a.destination.botToken, "");
    await ok(api(bob, "/api/settings", { destination: { targets: [] } }));
    assert.equal((await ok(api(alice, "/api/settings"))).destination.targets.length, 2);
  });

  let aliceCampaign: string, bobCampaign: string, alicePost: string, bobPost: string;
  let aliceTarget: string, bobTarget: string, aliceBot: string, bobBot: string, bobDelivery: string;
  await t.test("campaigns, bot registrations, posts and targets belong to their creator", async () => {
    for (const [token, name] of [[alice, "alice"], [bob, "bob"]]) {
      const account = (await ok(api(token, "/api/promotion/bot-accounts/personal", {}), 201)).botAccount;
      const target = (await ok(api(token, "/api/promotion/targets", { botAccountId: account.id, name, chatId: `@${name}-campaign`, chatType: "supergroup" }), 201)).target;
      await ok(api(token, `/api/promotion/targets/${target.id}/test`, {}));
      const campaign = (await ok(api(token, "/api/promotion/campaigns", { name: `${name} campaign`, ownerPrincipal: owner(aliceId) }), 201)).campaign;
      const post = (await ok(api(token, `/api/promotion/campaigns/${campaign.id}/posts`, { postId: "shared/1", contentMode: "original" }), 201)).campaignPost;
      if (name === "alice") { aliceCampaign=campaign.id; alicePost=post.id; aliceTarget=target.id; aliceBot=account.id; }
      else { bobCampaign=campaign.id; bobPost=post.id; bobTarget=target.id; bobBot=account.id; }
      assert.equal((await ok(api(token, "/api/promotion/campaigns"))).campaigns.length, 1);
    }
    assert.notEqual(aliceBot, bobBot);
    assert.equal((await api(bob, "/api/promotion/targets", { name: "cross-owner", botAccountId: aliceBot, chatId: "@cross" })).status, 400);
    assert.equal((await api(bob, `/api/promotion/campaigns/${bobCampaign}/posts`, { postId: "alice-only/1" })).status, 404);
  });

  await t.test("hourly cleanup preserves owner-specific inbox and campaign history", async () => {
    const cleanupJob = await db!.query(
      "select command from cron.job where jobname='tgreposter-inbox-cleanup'"
    );
    assert.equal(cleanupJob.rowCount, 1);
    const cleanupCommand = String(cleanupJob.rows[0].command);

    await db!.query("begin");
    try {
      await db!.query(
        `
          insert into posts
            (owner_principal, id, channel_username, original_text, published_at, created_at)
          values
            ($1, 'retention/approved', 'retention', 'approved', now() - interval '48 hours', now() - interval '48 hours'),
            ($2, 'retention/approved', 'retention', 'pending', now() - interval '48 hours', now() - interval '48 hours'),
            ($1, 'retention/posted', 'retention', 'posted', now() - interval '48 hours', now() - interval '48 hours'),
            ($2, 'retention/posted', 'retention', 'archived', now() - interval '48 hours', now() - interval '48 hours'),
            ($1, 'retention/campaign', 'retention', 'campaign', now() - interval '48 hours', now() - interval '48 hours'),
            ($2, 'retention/campaign', 'retention', 'unlinked', now() - interval '48 hours', now() - interval '48 hours'),
            ($1, 'retention/recent', 'retention', 'recent', now() - interval '1 hour', now() - interval '1 hour'),
            ($2, 'retention/recent', 'retention', 'recent', now() - interval '1 hour', now() - interval '1 hour'),
            ($1, 'retention/expired', 'retention', 'expired', now() - interval '48 hours', now() - interval '48 hours'),
            ($2, 'retention/expired', 'retention', 'expired', now() - interval '48 hours', now() - interval '48 hours')
        `,
        [owner(aliceId), owner(bobId)]
      );
      await db!.query(
        `
          insert into user_inbox_items (owner_principal, post_id, status)
          values
            ($1, 'retention/approved', 'approved'),
            ($2, 'retention/approved', 'pending'),
            ($1, 'retention/posted', 'posted'),
            ($2, 'retention/posted', 'archived')
        `,
        [owner(aliceId), owner(bobId)]
      );
      await db!.query(
        `
          insert into promotion_campaign_posts
            (owner_principal, campaign_id, post_id, content_mode, position)
          values ($1, $2, 'retention/campaign', 'original', 1)
        `,
        [owner(aliceId), aliceCampaign]
      );

      await db!.query(cleanupCommand);

      const retained = await db!.query(
        `
          select owner_principal, id
          from posts
          where id like 'retention/%'
          order by owner_principal, id
        `
      );
      assert.deepEqual(retained.rows, [
        { owner_principal: owner(aliceId), id: "retention/approved" },
        { owner_principal: owner(aliceId), id: "retention/campaign" },
        { owner_principal: owner(aliceId), id: "retention/posted" },
        { owner_principal: owner(aliceId), id: "retention/recent" },
        { owner_principal: owner(bobId), id: "retention/recent" },
      ]);
      assert.deepEqual(
        (await db!.query(
          "select owner_principal, post_id from user_inbox_items where post_id like 'retention/%' order by owner_principal, post_id"
        )).rows,
        [
          { owner_principal: owner(aliceId), post_id: "retention/approved" },
          { owner_principal: owner(aliceId), post_id: "retention/posted" },
        ]
      );
      assert.equal(
        (await db!.query(
          "select count(*)::int as count from promotion_campaign_posts where owner_principal=$1 and campaign_id=$2 and post_id='retention/campaign'",
          [owner(aliceId), aliceCampaign]
        )).rows[0].count,
        1
      );
    } finally {
      await db!.query("rollback");
    }
  });

  await t.test("cross-owner campaign reads, mutations, AI, launches and retries are rejected without sending", async () => {
    const count = (await outbound()).length;
    for (const [token, campaign, post, target, account] of [[bob,aliceCampaign,alicePost,aliceTarget,aliceBot], [alice,bobCampaign,bobPost,bobTarget,bobBot]]) {
      for (const [route, method, body] of [
        [`/campaigns/${campaign}`, "GET", undefined],
        [`/campaigns/${campaign}`, "PATCH", { name: "hijacked" }],
        [`/campaigns/${campaign}`, "DELETE", undefined],
        [`/campaigns/${campaign}/posts/${post}`, "PATCH", { promotionText: "hijacked" }],
        [`/campaigns/${campaign}/posts/${post}/ai`, "POST", { action: "rewrite" }],
        [`/campaigns/${campaign}/launch`, "POST", { targetIds: [target] }],
        [`/campaigns/${campaign}/retry`, "POST", {}],
        [`/targets/${target}`, "DELETE", undefined],
        [`/bot-accounts/${account}/verify`, "POST", {}],
      ] as const) {
        assert.equal((await api(token, `/api/promotion${route}`, body, method)).status, 404, `${method} ${route}`);
      }
    }
    assert.equal((await api(bob, `/api/promotion/campaigns/${bobCampaign}/launch`, { targetIds: [aliceTarget] })).status, 400);
    assert.equal((await api(bob, `/api/promotion/campaigns/${bobCampaign}/posts/${alicePost}`, { promotionText: "hijacked" }, "PATCH")).status, 404);
    assert.equal((await outbound()).length, count);
  });

  await t.test("owner-authorized campaign AI and delivery use Bob's configuration and leave Alice unchanged", async () => {
    const count = (await outbound()).length;
    await ok(api(bob, `/api/promotion/campaigns/${bobCampaign}/posts/${bobPost}/ai`, { action: "rewrite" }));
    const result = await ok(api(bob, `/api/promotion/campaigns/${bobCampaign}/launch`, { targetIds: [bobTarget] }));
    assert.equal(result.deliveries.length, 1);
    assert.equal(result.deliveries[0].status, "success");
    bobDelivery = result.deliveries[0].id;
    const calls = (await outbound()).slice(count);
    assert.equal(calls.find(call => call.kind === "ai").body.model, "bob-model");
    assert.ok(calls.filter(call => call.kind === "telegram").every(call => call.botToken === bot("bob")));
    const untouched = await ok(api(alice, `/api/promotion/campaigns/${aliceCampaign}`));
    assert.equal(untouched.campaign.status, "draft");
    assert.equal(untouched.deliveries.length, 0);
    const history = await db!.query("select distinct owner_principal from promotion_delivery_attempts");
    assert.deepEqual(history.rows.map(row => row.owner_principal), [owner(bobId)]);
  });

  await t.test("database foreign keys reject cross-owner references and client roles cannot bypass the API", async () => {
    const legacyTriggers = await db!.query(
      "select tgname from pg_trigger where not tgisinternal and tgname = any($1::text[])",
      [["trg_tgreposter_promotion_target_owner", "trg_tgreposter_campaign_post_owner",
        "trg_tgreposter_delivery_owner", "trg_tgreposter_delivery_attempt_owner"]],
    );
    assert.deepEqual(legacyTriggers.rows, []);
    await assert.rejects(
      () => db!.query("insert into promotion_delivery_attempts(delivery_id,attempt_number,outcome) values($1,2,'failed')", [bobDelivery]),
      (error: any) => error.code === "23502",
    );
    for (const query of [
      () => db!.query("insert into promotion_delivery_attempts(owner_principal,delivery_id,attempt_number,outcome) values($1,$2,2,'failed')", [owner(aliceId), bobDelivery]),
      () => db!.query("update promotion_targets set bot_account_id=$1 where id=$2", [aliceBot, bobTarget]),
      () => db!.query("insert into user_inbox_items(owner_principal,post_id) values($1,'alice-only/1')", [owner(bobId)]),
      () => db!.query("insert into promotion_campaign_posts(owner_principal,campaign_id,post_id) values($1,$2,'alice-only/1')", [owner(bobId), aliceCampaign]),
      () => db!.query("insert into promotion_targets(owner_principal,bot_account_id,name,chat_id) values($1,$2,'bad','@bad')", [owner(bobId), aliceBot]),
      () => db!.query("insert into promotion_deliveries(owner_principal,campaign_post_id,target_id) values($1,$2,$3)", [owner(bobId), bobPost, aliceTarget]),
    ]) await assert.rejects(query, (error: any) => error.code === "23503");
    await db!.query("set role authenticated");
    try {
      for (const table of ["posts", "source_channels", "user_inbox_items", "destination_targets", "promotion_campaigns", "promotion_delivery_attempts"]) {
        await assert.rejects(() => db!.query(`select * from public.${table}`), (error: any) => error.code === "42501");
      }
      await db!.query("select set_config('request.jwt.claim.sub',$1,false)", [bobId]);
      assert.deepEqual((await db!.query("select id from profiles")).rows.map(row => row.id), [bobId]);
      await assert.rejects(() => db!.query("update profiles set role='super-admin'"), (error: any) => error.code === "42501");
    } finally { await db!.query("reset role"); }
  });

  await t.test("deactivating a profile blocks its existing token on the next request", async () => {
    await db!.query("update profiles set is_active=false where id=$1", [bobId]);
    assert.equal((await api(bob, "/api/settings")).status, 401);
    assert.equal((await api(bob, `/api/promotion/campaigns/${bobCampaign}/retry`, {})).status, 401);
    assert.equal((await api(alice, "/api/settings")).status, 200);
  });
});
