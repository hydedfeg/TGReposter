import fs from "fs";
import path from "path";

export class MediaService {
  private tempDir = path.join(process.cwd(), "temp");

  constructor() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  async downloadImage(url: string): Promise<string | null> {
    if (!url) return null;

    // Ignore emoji/icon assets
    if (
      url.startsWith("//telegram.org") ||
      url.includes("/emoji/") ||
      url.includes("/stickers/")
    ) {
      return null;
    }
console.log("Downloading:", url);

const response = await fetch(url);

console.log("HTTP Status:", response.status);
console.log("Content-Type:", response.headers.get("content-type"));

if (!response.ok) {
      throw new Error(`Failed downloading image (${response.status})`);
    }

    const type = response.headers.get("content-type") ?? "";

    if (!type.startsWith("image/")) {
      throw new Error(`Invalid content type: ${type}`);
    }

    const ext = type.split("/")[1] || "jpg";

    const filename = `${Date.now()}.${ext}`;

    const filepath = path.join(this.tempDir, filename);

    const buffer = Buffer.from(await response.arrayBuffer());

    fs.writeFileSync(filepath, buffer);

    return filepath;
  }

  deleteTemp(filepath?: string | null) {
    if (!filepath) return;

    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  }
}

export default new MediaService();