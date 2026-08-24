import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiBase = "http://127.0.0.1:3000";
const dataFileName = "settings-db.json";
const controlFileName = "mock-ai-control.json";
const callsFileName = "mock-ai-calls.jsonl";
const testModel = "openrouter/test-model";

function writeState(tempDir: string) {
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
          botToken: "",
          channelId: "",
          targets: [],
          connected: false
        },
        aiConfig: { provider: "openrouter", model: testModel },
        posts: [],
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

function writeAiConfig(
  tempDir: string,
  aiConfig: { provider: "gemini" | "openrouter"; model: string }
) {
  const settingsPath = path.join(tempDir, dataFileName);
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  settings.aiConfig = aiConfig;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
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

async function postJson(pathname: string, payload: Record<string, unknown>, token?: string) {
  const response = await fetch(`${apiBase}${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(payload)
  });
  const body = await response.json();
  return { response, body };
}

test("AI curation route regression suite", { timeout: 45_000 }, async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tgreposter-ai-tests-"));
  fs.symlinkSync(path.join(repoRoot, "node_modules"), path.join(tempDir, "node_modules"), "dir");
  writeState(tempDir);
  writeControl(tempDir, {});

  const env = {
    ...process.env,
    NODE_ENV: "production",
    OPENROUTER_API_KEY: "TEST_OPENROUTER_KEY"
  } as Record<string, string>;
  delete env.SUPABASE_URL;
  delete env.SUPABASE_ANON_KEY;
  delete env.SUPABASE_KEY;
  delete env.DATABASE_URL;
  delete env.GEMINI_API_KEY;

  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "--import",
      path.join(repoRoot, "tests/mockAiFetch.ts"),
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

  const setup = await postJson("/api/auth/setup", {
    username: "owner",
    password: "test-password"
  });
  assert.equal(setup.response.status, 200);
  const token = setup.body.token as string;
  assert.ok(token);

  await t.test("authentication is required after initial setup", async () => {
    clearCalls(tempDir);
    const { response, body } = await postJson("/api/ai/curate", {
      action: "summarize",
      text: "A post"
    });

    assert.equal(response.status, 401);
    assert.equal(body.error, "Unauthorized. Please log in.");
    assert.deepEqual(readCalls(tempDir), []);
  });

  await t.test("missing Gemini configuration preserves the existing API error", async () => {
    writeAiConfig(tempDir, { provider: "gemini", model: "gemini-test-model" });
    clearCalls(tempDir);

    try {
      const { response, body } = await postJson(
        "/api/ai/curate",
        { action: "summarize", text: "Original post" },
        token
      );

      assert.equal(response.status, 400);
      assert.deepEqual(body, {
        error: "Gemini API Key is missing. Please add GEMINI_API_KEY in the Secrets panel."
      });
      assert.deepEqual(readCalls(tempDir), []);
    } finally {
      writeAiConfig(tempDir, { provider: "openrouter", model: testModel });
    }
  });

  const cases = [
    {
      name: "rephrase",
      payload: { action: "rephrase", text: "Original post", context: "friendly" },
      prompt: "You are an expert Telegram channel editor. Rephrase this post to sound friendly. Ensure the writing is concise, captures readers' interest instantly, preserves any external URL links, and is formatted nicely for reading. Respond with ONLY the finalized text, no conversational introductions or explanations.\n\nPost:\nOriginal post"
    },
    {
      name: "summarize",
      payload: { action: "summarize", text: "Original post" },
      prompt: "You are a professional news summarizer. Write a highly scannable, engaging 1-2 sentence summary of this post. Respond with ONLY the summary content, no intros, no quotes.\n\nPost:\nOriginal post"
    },
    {
      name: "hashtags",
      payload: { action: "hashtags", text: "Original post" },
      prompt: "Generate 3 to 6 highly relevant, catchy hashtags based on the content of this post. Output them on a single line, space-separated, with '#' characters. Do not include any other text.\n\nPost:\nOriginal post"
    },
    {
      name: "translate",
      payload: { action: "translate", text: "Original post", context: "French" },
      prompt: "Translate the following Telegram post into French. Retain the original layout, bullet points, and any link URLs. Respond with ONLY the translated text, no meta-comments.\n\nPost:\nOriginal post"
    }
  ];

  for (const testCase of cases) {
    await t.test(`${testCase.name} preserves the current prompt and response contract`, async () => {
      writeControl(tempDir, { content: "  Mock curated result  " });
      clearCalls(tempDir);

      const { response, body } = await postJson("/api/ai/curate", testCase.payload, token);

      assert.equal(response.status, 200);
      assert.deepEqual(body, { result: "Mock curated result" });

      const calls = readCalls(tempDir);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].type, "openrouter");
      assert.equal(calls[0].method, "POST");
      assert.equal(calls[0].model, testModel);
      assert.deepEqual(calls[0].messages, [{ role: "user", content: testCase.prompt }]);
      assert.equal(calls[0].hasAuthorization, true);
      assert.equal(calls[0].httpReferer, "https://ai.studio/build");
      assert.equal(calls[0].appTitle, "Telegram Curator");
    });
  }

  await t.test("empty provider output returns a provider-neutral API error", async () => {
    writeControl(tempDir, { content: "   " });
    clearCalls(tempDir);

    const { response, body } = await postJson(
      "/api/ai/curate",
      { action: "summarize", text: "Original post" },
      token
    );

    assert.equal(response.status, 502);
    assert.deepEqual(body, {
      error: "AI provider returned an empty or invalid response. Please try again."
    });
    assert.equal(readCalls(tempDir).length, 1);
  });

  await t.test("missing text is rejected before the provider is called", async () => {
    clearCalls(tempDir);
    const { response, body } = await postJson("/api/ai/curate", { action: "summarize" }, token);

    assert.equal(response.status, 400);
    assert.equal(body.error, "Missing post text");
    assert.deepEqual(readCalls(tempDir), []);
  });

  await t.test("unknown actions are rejected before the provider is called", async () => {
    clearCalls(tempDir);
    const { response, body } = await postJson(
      "/api/ai/curate",
      { action: "unsupported", text: "Original post" },
      token
    );

    assert.equal(response.status, 400);
    assert.equal(body.error, "Invalid curation action");
    assert.deepEqual(readCalls(tempDir), []);
  });

  await t.test("OpenRouter errors preserve the existing API error shape", async () => {
    writeControl(tempDir, { mode: "error", status: 429, message: "Mock rate limit" });
    clearCalls(tempDir);

    const { response, body } = await postJson(
      "/api/ai/curate",
      { action: "summarize", text: "Original post" },
      token
    );

    assert.equal(response.status, 500);
    assert.deepEqual(body, { error: "Mock rate limit (429)" });
    assert.equal(readCalls(tempDir).length, 1);
  });

  await t.test("OpenRouter connection failures preserve the existing API error shape", async () => {
    writeControl(tempDir, { mode: "throw", message: "Mock connection failure" });
    clearCalls(tempDir);

    const { response, body } = await postJson(
      "/api/ai/curate",
      { action: "summarize", text: "Original post" },
      token
    );

    assert.equal(response.status, 500);
    assert.deepEqual(body, { error: "Mock connection failure" });
    assert.equal(readCalls(tempDir).length, 1);
  });
});
