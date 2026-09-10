// Loaded only by the isolated integration-test child process. Unknown outbound
// requests fail closed, so this suite cannot reach real Auth, AI or Telegram.
import fs from "node:fs";
const users = [
  { id: "11111111-1111-4111-8111-111111111111", email: "alice@example.test", token: "alice-test-session" },
  { id: "22222222-2222-4222-8222-222222222222", email: "bob@example.test", token: "bob-test-session" },
];
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json" },
});
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("https://tenant-auth.invalid/auth/v1/")) {
    if (url.includes("/token?")) {
      const body = JSON.parse(String(init?.body));
      const user = users.find(user => user.email === body.email && body.password === "test-password");
      return user ? json({ access_token: user.token, user }) : json({ error: "Invalid credentials" }, 401);
    }
    if (url.endsWith("/user")) {
      const token = new Headers(init?.headers).get("Authorization")?.replace("Bearer ", "");
      const user = users.find(user => user.token === token);
      // A forged role in user_metadata must never override the database profile.
      return user ? json({ ...user, user_metadata: { role: "super-admin" } }) : json({}, 401);
    }
  }
  if (url.startsWith("https://t.me/s/")) {
    return new Response(`<div class="tgme_widget_message_wrap"><div data-post="shared/1"><div class="tgme_widget_message_text" dir="auto">Collected shared post</div><time datetime="${new Date().toISOString()}"></time></div></div>`);
  }
  if (url.startsWith("https://api.telegram.org/bot")) {
    const method = url.split("/").pop();
    const botToken = url.split("/bot")[1].split("/")[0];
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    fs.appendFileSync("tenant-outbound.jsonl", JSON.stringify({ kind: "telegram", method, botToken, body }) + "\n");
    if (method === "getMe") return json({ ok: true, result: { id: 123456, is_bot: true, username: "test_bot" } });
    if (method === "getChat") return json({ ok: true, result: { id: body.chat_id, type: "supergroup", title: "Test Group", permissions: { can_send_messages: true } } });
    if (method === "getChatMember") return json({ ok: true, result: { status: "administrator", can_post_messages: true, can_send_messages: true } });
    return json({ ok: true, result: { message_id: 9876 } });
  }
  if (url === "https://openrouter.ai/api/v1/chat/completions") {
    const body = JSON.parse(String(init?.body));
    fs.appendFileSync("tenant-outbound.jsonl", JSON.stringify({ kind: "ai", body }) + "\n");
    return json({ choices: [{ message: { content: "Test promotional copy" } }] });
  }
  throw new Error(`Unexpected external request blocked by tenant test: ${url}`);
}) as typeof fetch;
