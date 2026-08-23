import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataFileName = "settings-db.json";
const controlFileName = "mock-telegram-control.json";
const callsFileName = "mock-telegram-calls.jsonl";
const apiBase = "http://127.0.0.1:3000";

interface Target {
  id: string;
  channelId: string;
  name: string;
  enabled: boolean;
}

const targetA: Target = { id: "a", channelId: "alpha", name: "Alpha", enabled: true };
const targetB: Target = { id: "b", channelId: "@beta", name: "Beta", enabled: true };
const disabledTarget: Target = { id: "off", channelId: "@off", name: "Disabled", enabled: false };

function makePost(overrides: Record<string, unknown> = {}) {
  return {
    id: "source/1",
    channelUsername: "source",
    originalText: "hello",
    text: "hello",
    date: new Date().toISOString(),
    url: "https://t.me/source/1",
    status: "pending",
    ...overrides
  };
}

function writeState(tempDir: string, targets: Target[], post = makePost()) {
  fs.writeFileSync(
    path.join(tempDir, dataFileName),
    JSON.stringify(
      {
        channels: [],
        filters: {
          positiveKeywords: [],
          negativeKeywords: [],
          requiredHashtags: [],
          caseSensitive: false
        },
        destination: {
          botToken: "TEST_TOKEN",
          channelId: "",
          targets,
          connected: false
        },
        aiConfig: { provider: "gemini", model: "gemini-3.5-flash" },
        posts: [post],
        users: []
      },
      null,
      2
    ),
    "utf8"
  );
}

function writeControl(tempDir: string, control: Record<string, unknown>) {
  fs.writeFileSync(path.join(tempDir, controlFileName), JSON.stringify(control, null, 2), "utf8");
}

function clearCalls(tempDir: string) {
  fs.rmSync(path.join(tempDir, callsFileName), { force: true });
}

function readCalls(tempDir: string): any[] {
  const callsPath = path.join(tempDir, callsFileName);
  if (!fs.existsSync(callsPath)) return [];
  return fs
    .readFileSync(callsPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function assertTempMediaCleaned(tempDir: string) {
  const mediaTempDir = path.join(tempDir, "temp");
  if (!fs.existsSync(mediaTempDir)) return;
  assert.deepEqual(fs.readdirSync(mediaTempDir), []);
}

async function postTelegram(payload: Record<string, unknown>) {
  const response = await fetch(`${apiBase}/api/post-telegram`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json();
  return { response, body };
}

async function waitForServer(child: ChildProcessWithoutNullStreams) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode !== null) {
      throw new Error(`Test server exited early with code ${child.exitCode}.`);
    }
    try {
      const response = await fetch(`${apiBase}/api/auth/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: null })
      });
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw lastError || new Error("Test server did not become ready.");
}

async function stopServer(child: ChildProcessWithoutNullStreams) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>(resolve => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolve();
    }, 2000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

test("Telegram publishing route regression suite", { timeout: 45_000 }, async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tgreposter-publish-tests-"));
  writeState(tempDir, [targetA]);
  writeControl(tempDir, {});

  const env = { ...process.env, NODE_ENV: "production" } as Record<string, string>;
  delete env.SUPABASE_URL;
  delete env.SUPABASE_ANON_KEY;
  delete env.SUPABASE_KEY;
  delete env.DATABASE_URL;

  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "--import",
      path.join(repoRoot, "tests/mockTelegramFetch.ts"),
      path.join(repoRoot, "server.ts")
    ],
    {
      cwd: tempDir,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  let serverOutput = "";
  child.stdout.on("data", chunk => { serverOutput += String(chunk); });
  child.stderr.on("data", chunk => { serverOutput += String(chunk); });

  t.after(async () => {
    await stopServer(child);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  try {
    await waitForServer(child);
  } catch (error) {
    throw new Error(`${String(error)}\nServer output:\n${serverOutput}`);
  }

  await t.test("disabled target selection is rejected before Telegram is called", async () => {
    writeState(tempDir, [targetA, disabledTarget]);
    writeControl(tempDir, {});
    clearCalls(tempDir);

    const { response, body } = await postTelegram({
      postId: "source/1",
      targetIds: ["off"]
    });

    assert.equal(response.status, 400);
    assert.deepEqual(body.disabledTargetIds, ["off"]);
    assert.deepEqual(readCalls(tempDir), []);
  });

  await t.test("long text is sent as safe plain-text chunks", async () => {
    writeState(tempDir, [targetA]);
    writeControl(tempDir, { targets: { "@alpha": { sendMessage: "success" } } });
    clearCalls(tempDir);

    const { response, body } = await postTelegram({
      postId: "source/1",
      text: "x".repeat(5000),
      targetIds: ["a"]
    });

    assert.equal(response.status, 200);
    assert.equal(body.outcome, "success");
    const sends = readCalls(tempDir).filter(call => call.type === "telegram" && call.method === "sendMessage");
    assert.equal(sends.length, 2);
    assert.ok(sends.every(call => Array.from(call.payload.text).length <= 4000));
    assert.ok(sends.every(call => !("parse_mode" in call.payload)));
    assert.ok(sends.every(call => call.chatId === "@alpha"));
  });

  await t.test("multi-target publishing reports partial success in configured order", async () => {
    writeState(tempDir, [targetA, targetB]);
    writeControl(tempDir, {
      targets: {
        "@alpha": { sendMessage: "success" },
        "@beta": { sendMessage: { type: "error", description: "chat not found" } }
      }
    });
    clearCalls(tempDir);

    const { body } = await postTelegram({
      postId: "source/1",
      targetIds: ["a", "b"]
    });

    assert.equal(body.success, true);
    assert.equal(body.outcome, "partial");
    assert.deepEqual(body.summary, { total: 2, succeeded: 1, failed: 1, warnings: 0 });
    assert.deepEqual(body.results.map((result: any) => result.targetId), ["a", "b"]);
    assert.equal(body.results[1].error.includes("chat not found"), true);
  });

  await t.test("all target failures report a full delivery failure", async () => {
    writeState(tempDir, [targetA, targetB]);
    writeControl(tempDir, {
      targets: {
        "@alpha": { sendMessage: { type: "error", description: "forbidden alpha" } },
        "@beta": { sendMessage: { type: "error", description: "forbidden beta" } }
      }
    });
    clearCalls(tempDir);

    const { body } = await postTelegram({
      postId: "source/1",
      targetIds: ["a", "b"]
    });

    assert.equal(body.success, false);
    assert.equal(body.outcome, "failure");
    assert.deepEqual(body.summary, { total: 2, succeeded: 0, failed: 2, warnings: 0 });
  });

  await t.test("an aborted Telegram request fails only that destination", async () => {
    writeState(tempDir, [targetA, targetB]);
    writeControl(tempDir, {
      targets: {
        "@alpha": { sendMessage: "abort" },
        "@beta": { sendMessage: "success" }
      }
    });
    clearCalls(tempDir);

    const { body } = await postTelegram({
      postId: "source/1",
      targetIds: ["a", "b"]
    });

    assert.equal(body.outcome, "partial");
    assert.equal(body.results[0].error.includes("timed out after 30 seconds"), true);
    assert.equal(body.results[1].success, true);
  });

  await t.test("photo failure falls back to text, records a warning, and cleans temp files", async () => {
    writeState(
      tempDir,
      [targetA],
      makePost({ photoUrl: "https://cdn4.telesco.pe/photo.jpg", mediaType: "photo" })
    );
    writeControl(tempDir, {
      targets: {
        "@alpha": {
          sendPhoto: { type: "error", description: "photo rejected" },
          sendMessage: "success"
        }
      }
    });
    clearCalls(tempDir);

    const { body } = await postTelegram({ postId: "source/1", targetIds: ["a"] });
    const calls = readCalls(tempDir);

    assert.equal(body.outcome, "success");
    assert.equal(body.summary.warnings, 1);
    assert.equal(body.results[0].warning.includes("Photo was not attached"), true);
    assert.equal(calls.some(call => call.type === "media" && call.url.endsWith("photo.jpg")), true);
    assert.equal(calls.some(call => call.method === "sendPhoto"), true);
    assert.equal(calls.some(call => call.method === "sendMessage"), true);
    assertTempMediaCleaned(tempDir);
  });

  await t.test("video uses sendVideo streaming, a bounded caption, continuation text, and cleanup", async () => {
    writeState(
      tempDir,
      [targetA],
      makePost({ videoUrl: "https://cdn4.telesco.pe/video.mp4", mediaType: "video", text: "v".repeat(1500) })
    );
    writeControl(tempDir, {
      targets: {
        "@alpha": { sendVideo: "success", sendMessage: "success" }
      }
    });
    clearCalls(tempDir);

    const { body } = await postTelegram({ postId: "source/1", targetIds: ["a"] });
    const calls = readCalls(tempDir);
    const videoCall = calls.find(call => call.type === "telegram" && call.method === "sendVideo");
    const continuationCalls = calls.filter(call => call.type === "telegram" && call.method === "sendMessage");

    assert.equal(body.outcome, "success");
    assert.ok(videoCall);
    assert.equal(videoCall.payload.supports_streaming, "true");
    assert.ok(Array.from(videoCall.payload.caption).length <= 1000);
    assert.equal(continuationCalls.length, 1);
    assertTempMediaCleaned(tempDir);
  });

  await t.test("video upload failure falls back to the canonical Telegram post link", async () => {
    writeState(
      tempDir,
      [targetA],
      makePost({ videoUrl: "https://cdn4.telesco.pe/video.mp4", mediaType: "video" })
    );
    writeControl(tempDir, {
      targets: {
        "@alpha": {
          sendVideo: { type: "error", description: "video rejected" },
          sendMessage: "success"
        }
      }
    });
    clearCalls(tempDir);

    const { body } = await postTelegram({ postId: "source/1", targetIds: ["a"] });
    const fallback = readCalls(tempDir).find(call => call.type === "telegram" && call.method === "sendMessage");

    assert.equal(body.outcome, "success");
    assert.equal(body.summary.warnings, 1);
    assert.equal(body.results[0].warning.includes("Video was not attached"), true);
    assert.equal(fallback.payload.text.includes("https://t.me/source/1"), true);
    assertTempMediaCleaned(tempDir);
  });
});
