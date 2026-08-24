import fs from "fs";
import path from "path";

const realFetch = globalThis.fetch.bind(globalThis);
const controlPath = path.join(process.cwd(), "mock-ai-control.json");
const callsPath = path.join(process.cwd(), "mock-ai-calls.jsonl");

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

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

  if (url === "https://openrouter.ai/api/v1/chat/completions") {
    let payload: Record<string, any> = {};
    if (typeof init?.body === "string") {
      payload = JSON.parse(init.body);
    }

    const headers = new Headers(init?.headers);
    recordCall({
      type: "openrouter",
      method: init?.method,
      model: payload.model,
      messages: payload.messages,
      hasAuthorization: headers.has("authorization"),
      httpReferer: headers.get("http-referer"),
      appTitle: headers.get("x-title")
    });

    const control = readControl();
    if (control.mode === "throw") {
      throw new Error(control.message || "Mock OpenRouter connection failure");
    }

    if (control.mode === "error") {
      return new Response(
        JSON.stringify({ error: { message: control.message || "Mock OpenRouter error" } }),
        {
          status: control.status || 500,
          headers: { "content-type": "application/json" }
        }
      );
    }

    return new Response(
      JSON.stringify({
        id: "mock-generation",
        model: "mock/provider-model",
        choices: [
          {
            message: {
              role: "assistant",
              content: control.content ?? "  Mock curated result  "
            }
          }
        ]
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }

  return realFetch(input as any, init);
}) as typeof fetch;
