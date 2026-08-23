import fs from "fs";
import path from "path";

const realFetch = globalThis.fetch.bind(globalThis);
const controlPath = path.join(process.cwd(), "mock-telegram-control.json");
const callsPath = path.join(process.cwd(), "mock-telegram-calls.jsonl");

function readControl(): any {
  try {
    return JSON.parse(fs.readFileSync(controlPath, "utf8"));
  } catch {
    return {};
  }
}

function recordCall(entry: Record<string, unknown>) {
  fs.appendFileSync(callsPath, `${JSON.stringify(entry)}\n`, "utf8");
}

function telegramJson(ok: boolean, description?: string, status = ok ? 200 : 400) {
  return new Response(
    JSON.stringify(ok ? { ok: true, result: { message_id: 1 } } : { ok: false, description }),
    { status, headers: { "content-type": "application/json" } }
  );
}

function serializeFormData(form: FormData) {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") {
      payload[key] = value;
    } else {
      payload[key] = {
        name: value.name,
        type: value.type,
        size: value.size
      };
    }
  }
  return payload;
}

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

  if (url.startsWith("https://api.telegram.org/bot")) {
    const method = url.split("/").pop() || "unknown";
    let payload: Record<string, any> = {};

    if (typeof init?.body === "string") {
      try {
        payload = JSON.parse(init.body);
      } catch {
        payload = { rawBody: init.body };
      }
    } else if (init?.body instanceof FormData) {
      payload = serializeFormData(init.body);
    }

    const chatId = String(payload.chat_id || "");
    recordCall({ type: "telegram", method, chatId, payload });

    const behavior = readControl()?.targets?.[chatId]?.[method] ?? "success";

    if (behavior === "abort" || behavior?.type === "abort") {
      const error = new Error("mock abort");
      error.name = "AbortError";
      throw error;
    }

    if (behavior === "hang" || behavior?.type === "hang") {
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("mock abort");
          error.name = "AbortError";
          reject(error);
        });
      });
    }

    if (behavior === "error" || behavior?.type === "error") {
      const description = behavior?.description || "Mock Telegram error";
      return telegramJson(false, description, behavior?.status || 400);
    }

    return telegramJson(true);
  }

  if (url.startsWith("https://cdn4.telesco.pe/") || url.startsWith("https://cdn4.cdn-telegram.org/")) {
    recordCall({ type: "media", url });
    const mediaBehavior = readControl()?.media || {};

    if (url.endsWith(".mp4")) {
      if (mediaBehavior.video === "error") {
        return new Response("video unavailable", { status: 500 });
      }
      const bytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 109, 112, 52, 50]);
      return new Response(bytes, {
        status: 200,
        headers: {
          "content-type": "video/mp4",
          "content-length": String(bytes.byteLength)
        }
      });
    }

    if (mediaBehavior.photo === "error") {
      return new Response("photo unavailable", { status: 500 });
    }

    const bytes = new Uint8Array([255, 216, 255, 217]);
    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": "image/jpeg",
        "content-length": String(bytes.byteLength)
      }
    });
  }

  return realFetch(input as any, init);
}) as typeof fetch;
