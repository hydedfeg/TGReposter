import { Router } from "express";
import {
  saveDemoRequest,
  validateDemoRequest,
} from "../services/demoRequestService";

const DEMO_REQUEST_WINDOW_MS = 15 * 60 * 1000;
const DEMO_REQUEST_MAX_PER_WINDOW = 5;

type RequestWindow = {
  count: number;
  startedAt: number;
};

const requestWindows = new Map<string, RequestWindow>();

function clientKey(req: any): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    const addresses = forwarded.split(",").map((value) => value.trim()).filter(Boolean);
    return addresses.at(-1) || req.ip || req.socket?.remoteAddress || "unknown";
  }

  return req.ip || req.socket?.remoteAddress || "unknown";
}

function isRateLimited(key: string): boolean {
  const now = Date.now();

  if (requestWindows.size > 1000) {
    for (const [storedKey, window] of requestWindows) {
      if (now - window.startedAt >= DEMO_REQUEST_WINDOW_MS) {
        requestWindows.delete(storedKey);
      }
    }
  }

  const current = requestWindows.get(key);

  if (!current || now - current.startedAt >= DEMO_REQUEST_WINDOW_MS) {
    requestWindows.set(key, { count: 1, startedAt: now });
    return false;
  }

  current.count += 1;
  return current.count > DEMO_REQUEST_MAX_PER_WINDOW;
}

export function createDemoRequestRouter() {
  const router = Router();

  router.post("/", async (req, res) => {
    if (typeof req.body?.website === "string" && req.body.website.trim()) {
      return res.status(201).json({ success: true });
    }

    if (isRateLimited(clientKey(req))) {
      return res.status(429).json({
        code: "DEMO_REQUEST_RATE_LIMITED",
        error: "Too many demo requests.",
      });
    }

    const validation = validateDemoRequest(req.body);
    if (!validation.ok) {
      return res.status(400).json({
        code: validation.code,
        error: "Invalid demo request.",
      });
    }

    if (!process.env.DATABASE_URL) {
      return res.status(503).json({
        code: "DEMO_REQUEST_STORAGE_UNAVAILABLE",
        error: "Demo request storage is unavailable.",
      });
    }

    try {
      const requestId = await saveDemoRequest(validation.value);
      return res.status(201).json({
        success: true,
        requestId,
      });
    } catch (error: any) {
      if (error?.name === "DemoRequestRateLimitError") {
        return res.status(429).json({
          code: "DEMO_REQUEST_RATE_LIMITED",
          error: "Too many demo requests.",
        });
      }

      console.error("Demo request submission failed:", {
        name: error?.name,
        code: error?.code,
      });

      return res.status(500).json({
        code: "DEMO_REQUEST_SAVE_FAILED",
        error: "Demo request could not be saved.",
      });
    }
  });

  return router;
}
