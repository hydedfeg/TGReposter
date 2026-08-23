import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface DownloadedImage {
  filepath: string;
  filename: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  sizeBytes: number;
}

export class MediaService {
  private tempDir = path.join(process.cwd(), "temp");
  private readonly maxImageBytes = 10 * 1024 * 1024;
  private readonly maxRedirects = 3;
  private readonly requestTimeoutMs = 15000;

  constructor() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  private validateTelegramMediaUrl(rawUrl: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error("Invalid Telegram media URL.");
    }

    if (parsed.protocol !== "https:") {
      throw new Error("Telegram media must use HTTPS.");
    }

    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    const isAllowedHost =
      hostname === "t.me" ||
      hostname === "telegram.org" ||
      hostname === "cdn4.telegram-cdn.org" ||
      hostname.endsWith(".telegram-cdn.org");

    if (!isAllowedHost) {
      throw new Error("Refusing to download media from a non-Telegram host.");
    }

    if (
      pathname.includes("/img/emoji/") ||
      pathname.includes("/emoji/") ||
      pathname.includes("/stickers/") ||
      pathname.includes("/img/icons/") ||
      pathname.includes("/img/tgme/") ||
      pathname.endsWith(".svg")
    ) {
      throw new Error("Refusing to download decorative Telegram media.");
    }

    return parsed;
  }

  private async fetchTelegramMedia(rawUrl: string): Promise<Response> {
    let currentUrl = this.validateTelegramMediaUrl(rawUrl);

    for (let redirectCount = 0; redirectCount <= this.maxRedirects; redirectCount++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

      try {
        const response = await fetch(currentUrl, {
          redirect: "manual",
          signal: controller.signal
        });

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (!location) {
            throw new Error(`Telegram media redirect (${response.status}) did not include a location.`);
          }

          if (redirectCount === this.maxRedirects) {
            throw new Error("Telegram media exceeded the redirect limit.");
          }

          currentUrl = this.validateTelegramMediaUrl(new URL(location, currentUrl).toString());
          continue;
        }

        return response;
      } catch (err: any) {
        if (err?.name === "AbortError") {
          throw new Error("Timed out while downloading Telegram media.");
        }
        throw err;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new Error("Telegram media download failed after redirects.");
  }

  async downloadImageWithMetadata(url: string): Promise<DownloadedImage | null> {
    if (!url) return null;

    const response = await this.fetchTelegramMedia(url);
    if (!response.ok) {
      throw new Error(`Failed downloading image (${response.status}).`);
    }

    const contentTypeHeader = (response.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();

    const allowedTypes: Record<string, { contentType: DownloadedImage["contentType"]; extension: string }> = {
      "image/jpeg": { contentType: "image/jpeg", extension: "jpg" },
      "image/jpg": { contentType: "image/jpeg", extension: "jpg" },
      "image/png": { contentType: "image/png", extension: "png" },
      "image/webp": { contentType: "image/webp", extension: "webp" }
    };

    const mediaType = allowedTypes[contentTypeHeader];
    if (!mediaType) {
      throw new Error(`Unsupported Telegram photo content type: ${contentTypeHeader || "unknown"}.`);
    }

    const declaredLength = Number(response.headers.get("content-length") || "0");
    if (Number.isFinite(declaredLength) && declaredLength > this.maxImageBytes) {
      throw new Error("Telegram photo exceeds the 10 MB Bot API upload limit.");
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0) {
      throw new Error("Downloaded Telegram photo was empty.");
    }
    if (buffer.byteLength > this.maxImageBytes) {
      throw new Error("Telegram photo exceeds the 10 MB Bot API upload limit.");
    }

    const filename = `${crypto.randomUUID()}.${mediaType.extension}`;
    const filepath = path.join(this.tempDir, filename);
    fs.writeFileSync(filepath, buffer);

    return {
      filepath,
      filename,
      contentType: mediaType.contentType,
      sizeBytes: buffer.byteLength
    };
  }

  // Backwards-compatible wrapper retained for the existing debug endpoint.
  async downloadImage(url: string): Promise<string | null> {
    const downloaded = await this.downloadImageWithMetadata(url);
    return downloaded?.filepath ?? null;
  }

  deleteTemp(filepath?: string | null) {
    if (!filepath) return;

    try {
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
    } catch (err) {
      console.error("Failed deleting temporary media file:", err);
    }
  }
}

export default new MediaService();
