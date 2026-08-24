import mediaService from "./server/services/mediaService";
import postService from "./server/services/postService";
import channelRoutes from "./server/routes/channels";
import { buildCurationPrompt, isCurationAction } from "./server/ai/curationPrompt";
import { dispatchCuration } from "./server/ai/curationDispatcher";
import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import crypto from "crypto";
import { isSupabaseConfigured, readSupabaseDb, writeSupabaseDb, checkTableExists, autoCreateSettingsTable } from "./supabase.js";

dotenv.config();

const app = express();
const PORT = 3000;

// Shared interfaces match src/types.ts
interface SourceChannel {
  username: string;
  name?: string;
  lastFetched?: string;
  status?: 'idle' | 'fetching' | 'success' | 'error';
  errorMessage?: string;
}

interface FilterConfig {
  positiveKeywords: string[];
  negativeKeywords: string[];
  requiredHashtags: string[];
  caseSensitive: boolean;
}

interface CuratedPost {
  id: string;
  channelUsername: string;
  originalText: string;
  text: string;
  mediaType?: 'photo' | 'video';
  photoUrl?: string;
  videoUrl?: string;
  date: string;
  url: string;
  status: 'pending' | 'approved' | 'posted' | 'archived';
  postedAt?: string;
  errorMessage?: string;
}

interface DestinationTarget {
  id: string;
  channelId: string; // e.g. "@my_channel" or "-100123456789"
  name: string;      // Friendly display name
  enabled: boolean;
  status?: 'idle' | 'success' | 'error';
  errorMessage?: string;
}

interface DestinationConfig {
  botToken: string;
  channelId?: string; // Kept for backwards compatibility
  targets: DestinationTarget[];
  connected: boolean;
}

interface AIConfig {
  provider: "gemini" | "openrouter";
  model: string;
}

interface CuratorUser {
  username: string;
  passwordHash: string;
  role: 'super-admin' | 'admin';
  createdAt: string;
}

interface CuratorSettings {
  channels: SourceChannel[];
  filters: FilterConfig;
  destination: DestinationConfig;
  aiConfig?: AIConfig;
  posts: CuratedPost[];
  passwordHash?: string;
  users?: CuratorUser[];
}

function normalizeTelegramMediaUrl(rawUrl?: string): string | undefined {
  if (!rawUrl) return undefined;

  const trimmedUrl = rawUrl.trim();
  if (!trimmedUrl) return undefined;

  if (trimmedUrl.startsWith("//")) {
    return `https:${trimmedUrl}`;
  }

  if (trimmedUrl.startsWith("/")) {
    return `https://t.me${trimmedUrl}`;
  }

  return trimmedUrl;
}

function isValidTelegramPostMediaUrl(rawUrl?: string): rawUrl is string {
  const normalizedUrl = normalizeTelegramMediaUrl(rawUrl);
  if (!normalizedUrl) return false;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalizedUrl);
  } catch {
    return false;
  }

  const pathname = parsedUrl.pathname.toLowerCase();
  const hostname = parsedUrl.hostname.toLowerCase();

  // Telegram post HTML can include decorative <img> assets such as emoji glyphs
  // alongside real post media. Never treat those assets as downloadable media.
  if (
    pathname.includes("/img/emoji/") ||
    pathname.includes("/emoji/") ||
    pathname.includes("/stickers/") ||
    pathname.endsWith(".svg") ||
    pathname.includes("/img/icons/") ||
    pathname.includes("/img/tgme/")
  ) {
    return false;
  }

  return parsedUrl.protocol === "https:" && (
    hostname === "t.me" ||
    hostname === "telegram.org" ||
    hostname === "telesco.pe" ||
    hostname.endsWith(".telesco.pe") ||
    hostname === "cdn-telegram.org" ||
    hostname.endsWith(".cdn-telegram.org") ||
    hostname === "cdn4.telegram-cdn.org" ||
    hostname.endsWith(".telegram-cdn.org")
  );
}

function extractTelegramPhotoUrl(block: string): string | undefined {
  const mediaUrlMatches = [
    // Prefer Telegram's actual message photo wrapper. Video thumbnails are handled
    // separately and must never be promoted to authoritative photo media.
    block.match(/tgme_widget_message_photo_wrap[^"]*"[^>]*style="[^"]*background-image:\s*url\(['"]?([^'")]+)['"]?\)/),
  ];

  for (const match of mediaUrlMatches) {
    const normalizedUrl = normalizeTelegramMediaUrl(match?.[1]);
    if (isValidTelegramPostMediaUrl(normalizedUrl)) {
      return normalizedUrl;
    }
  }

  // Backwards-compatible fallback for older Telegram markup, but reject avatars,
  // video thumbnails, emoji images, and decorative icons before assigning photoUrl.
  const backgroundImageMatches = block.matchAll(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/g);
  for (const match of backgroundImageMatches) {
    const nearbyMarkup = block.slice(Math.max(0, (match.index ?? 0) - 200), match.index);
    if (
      nearbyMarkup.includes("tgme_widget_message_owner_photo") ||
      nearbyMarkup.includes("tgme_widget_message_video_thumb")
    ) {
      continue;
    }

    const normalizedUrl = normalizeTelegramMediaUrl(match[1]);
    if (isValidTelegramPostMediaUrl(normalizedUrl)) {
      return normalizedUrl;
    }
  }

  return undefined;
}

function extractTelegramVideoUrl(block: string): string | undefined {
  const videoMatches = [
    block.match(/<video[^>]*class="[^"]*tgme_widget_message_video[^"]*"[^>]*src="([^"]+)"/i),
    block.match(/<video[^>]*src="([^"]+)"[^>]*class="[^"]*tgme_widget_message_video[^"]*"/i),
    block.match(/class="[^"]*tgme_widget_message_video[^"]*"[^>]*src="([^"]+)"/i),
  ];

  for (const match of videoMatches) {
    const normalizedUrl = normalizeTelegramMediaUrl(match?.[1]);
    if (isValidTelegramPostMediaUrl(normalizedUrl)) {
      return normalizedUrl;
    }
  }

  return undefined;
}

function repairLegacyPhotoUrl(existingPhotoUrl?: string, newlyExtractedPhotoUrl?: string): string | undefined {
  const normalizedExistingPhotoUrl = normalizeTelegramMediaUrl(existingPhotoUrl);
  const normalizedNewPhotoUrl = normalizeTelegramMediaUrl(newlyExtractedPhotoUrl);
  const hasValidExistingPhotoUrl = isValidTelegramPostMediaUrl(normalizedExistingPhotoUrl);
  const hasValidNewPhotoUrl = isValidTelegramPostMediaUrl(normalizedNewPhotoUrl);

  if (!hasValidExistingPhotoUrl) {
    return hasValidNewPhotoUrl ? normalizedNewPhotoUrl : undefined;
  }

  if (normalizedExistingPhotoUrl !== existingPhotoUrl) {
    return normalizedExistingPhotoUrl;
  }

  return existingPhotoUrl;
}

// Keep text-only Telegram messages below the documented 4096-character limit.
// Array.from() splits by Unicode code point, so emoji/surrogate pairs are never cut in half.
function splitTelegramText(text: string, maxLength = 4000): string[] {
  const characters = Array.from(text);
  const chunks: string[] = [];
  let start = 0;

  while (start < characters.length) {
    const remainingLength = characters.length - start;
    if (remainingLength <= maxLength) {
      const finalChunk = characters.slice(start).join("");
      if (finalChunk.trim()) chunks.push(finalChunk);
      break;
    }

    const window = characters.slice(start, start + maxLength);
    const minimumNaturalBreak = Math.floor(maxLength * 0.6);
    let splitAt = -1;

    for (let i = window.length - 1; i >= minimumNaturalBreak; i--) {
      if (window[i] === "\n") {
        splitAt = i + 1;
        break;
      }
    }

    if (splitAt === -1) {
      for (let i = window.length - 1; i >= minimumNaturalBreak; i--) {
        if (/\s/.test(window[i])) {
          splitAt = i + 1;
          break;
        }
      }
    }

    const take = splitAt > 0 ? splitAt : maxLength;
    const chunk = characters.slice(start, start + take).join("");
    if (chunk.trim()) chunks.push(chunk);
    start += take;
  }

  return chunks;
}

// Bound Telegram Bot API requests so one slow destination cannot stall publishing indefinitely.
// Media uploads get a wider window than ordinary text requests; no automatic retries are used
// because an ambiguous Telegram timeout could otherwise create duplicate posts.
async function fetchTelegramWithTimeout(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  const requestUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  const timeoutMs = /\/send(?:Photo|Video)$/.test(requestUrl) ? 90_000 : 30_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error(`Telegram request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// Database storage
const DATA_FILE = path.join(process.cwd(), "settings-db.json");

// Memory-based active sessions
const activeSessions = new Map<string, { username: string; role: 'super-admin' | 'admin' }>();

function hashPassword(pwd: string): string {
  return crypto.createHash("sha256").update(pwd).digest("hex");
}

async function readDb(): Promise<CuratorSettings> {
  const defaultSettings: CuratorSettings = {
    channels: [
      { username: "techcrunch", name: "TechCrunch", lastFetched: "", status: "idle" },
      { username: "durov", name: "Durov's Channel", lastFetched: "", status: "idle" }
    ],
    filters: {
      positiveKeywords: ["AI", "Gemini", "Apple", "Google", "Vite", "React", "Startup"],
      negativeKeywords: ["crypto", "scam", "airdrop", "giveaway"],
      requiredHashtags: [],
      caseSensitive: false
    },
    destination: {
      botToken: "",
      channelId: "",
      targets: [],
      connected: false
    },
    aiConfig: {
      provider: "gemini",
      model: "gemini-3.5-flash"
    },
    posts: [],
    users: []
  };

  if (isSupabaseConfigured) {
    try {
      const sbData = await readSupabaseDb();
      if (sbData) {
        const destination = sbData.destination || defaultSettings.destination;
        if (!destination.targets) {
          destination.targets = [];
          if (destination.channelId) {
            destination.targets.push({
              id: "legacy",
              channelId: destination.channelId,
              name: "Default Target",
              enabled: true,
              status: "idle"
            });
          }
        }
        
        let users = sbData.users || [];
        let didMigrate = false;
        if (users.length === 0 && sbData.passwordHash) {
          users.push({
            username: "superadmin",
            passwordHash: sbData.passwordHash,
            role: "super-admin",
            createdAt: new Date().toISOString()
          });
          didMigrate = true;
        }

        const loadedSettings: CuratorSettings = {
          channels: sbData.channels || defaultSettings.channels,
          filters: sbData.filters || defaultSettings.filters,
          destination: destination,
          aiConfig: sbData.aiConfig || defaultSettings.aiConfig,
          posts: sbData.posts || defaultSettings.posts,
          passwordHash: sbData.passwordHash,
          users: users
        };

        if (didMigrate) {
          await writeSupabaseDb(loadedSettings);
        }

        return loadedSettings;
      } else {
        // Bootstrap Supabase with current local file settings if available, else defaults
        const local = readDbLocal(defaultSettings);
        await writeSupabaseDb(local);
        return local;
      }
    } catch (e: any) {
      console.error("Supabase read error, falling back to local storage:", e);
    }
  }

  return readDbLocal(defaultSettings);
}

function readDbLocal(defaultSettings: CuratorSettings): CuratorSettings {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      
      const destination = parsed.destination || defaultSettings.destination;
      if (!destination.targets) {
        destination.targets = [];
        if (destination.channelId) {
          destination.targets.push({
            id: "legacy",
            channelId: destination.channelId,
            name: "Default Target",
            enabled: true,
            status: "idle"
          });
        }
      }

      let users = parsed.users || [];
      let didMigrate = false;
      if (users.length === 0 && parsed.passwordHash) {
        users.push({
          username: "superadmin",
          passwordHash: parsed.passwordHash,
          role: "super-admin",
          createdAt: new Date().toISOString()
        });
        didMigrate = true;
      }

      const loadedSettings: CuratorSettings = {
        channels: parsed.channels || defaultSettings.channels,
        filters: parsed.filters || defaultSettings.filters,
        destination: destination,
        aiConfig: parsed.aiConfig || defaultSettings.aiConfig,
        posts: parsed.posts || defaultSettings.posts,
        passwordHash: parsed.passwordHash,
        users: users
      };

      if (didMigrate) {
        writeDbLocal(loadedSettings);
      }

      return loadedSettings;
    } catch (e) {
      console.error("Error reading JSON database:", e);
      return defaultSettings;
    }
  }

  writeDbLocal(defaultSettings);
  return defaultSettings;
}

async function writeDb(data: CuratorSettings) {
  if (isSupabaseConfigured) {
    try {
      const success = await writeSupabaseDb(data);
      if (success) return;
    } catch (e) {
      console.error("Supabase write error, falling back to local storage:", e);
    }
  }

  writeDbLocal(data);
}

function writeDbLocal(data: CuratorSettings) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error("Error writing JSON database:", e);
  }
}

// Initialize Gemini Client safely
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/api/channels", channelRoutes);

// Authentication Middleware
const authMiddleware = async (req: any, res: any, next: any) => {
  try {
    const db = await readDb();
    const usersExist = db.users && db.users.length > 0;
    if (!usersExist) {
      // No users configured yet, allow access to set up initial super-admin
      return next();
    }
    const authHeader = req.headers.authorization;
console.log("Authorization header:", authHeader);

const token = authHeader && authHeader.split(" ")[1];
console.log("Parsed token:", token);

console.log("Active sessions:", [...activeSessions.keys()]);
    if (token) {
      const session = activeSessions.get(token);
      if (session) {
        req.user = session; // Attach user/role details
        return next();
      }
    }
    return res.status(401).json({ error: "Unauthorized. Please log in." });
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const requireSuperAdmin = (req: any, res: any, next: any) => {
  if (req.user && req.user.role === "super-admin") {
    return next();
  }
  return res.status(403).json({ error: "Forbidden. Super-admin access required." });
};

// --- Authentication Endpoints ---

// Check authentication status
app.post("/api/auth/status", async (req, res) => {
  const db = await readDb();
  const usersExist = db.users && db.users.length > 0;
  const { token } = req.body;
  const session = token ? activeSessions.get(token) : null;
  res.json({
    passwordSet: usersExist,
    authenticated: !!session,
    role: session ? session.role : null,
    username: session ? session.username : null
  });
});

// Setup initial super-admin account
app.post("/api/auth/setup", async (req, res) => {
  const db = await readDb();
  if (db.users && db.users.length > 0) {
    return res.status(400).json({ error: "Administration account has already been configured." });
  }
  const { username, password } = req.body;
  if (!username || username.trim().length < 3) {
    return res.status(400).json({ error: "Username must be at least 3 characters." });
  }
  if (!password || password.length < 4) {
    return res.status(400).json({ error: "Password must be at least 4 characters long." });
  }

  const newUser: CuratorUser = {
    username: username.trim().toLowerCase(),
    passwordHash: hashPassword(password),
    role: "super-admin",
    createdAt: new Date().toISOString()
  };

  db.users = [newUser];
  db.passwordHash = newUser.passwordHash; // keep for backward compatibility
  await writeDb(db);

  // Auto-log in on setup
  const token = crypto.randomBytes(32).toString("hex");
  activeSessions.set(token, { username: newUser.username, role: newUser.role });

  res.json({ success: true, token, role: newUser.role, username: newUser.username, message: "Super-admin account configured successfully!" });
});

// Login endpoint
app.post("/api/auth/login", async (req, res) => {
  const db = await readDb();
  const usersExist = db.users && db.users.length > 0;
  if (!usersExist) {
    return res.status(400).json({ error: "No accounts configured. Please set up owner credentials." });
  }
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  const checkUser = username.trim().toLowerCase();
  const user = db.users?.find(u => u.username === checkUser);

  if (!user) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  const hash = hashPassword(password);
  if (hash === user.passwordHash) {
    const token = crypto.randomBytes(32).toString("hex");
    activeSessions.set(token, { username: user.username, role: user.role });
    
    console.log("LOGIN TOKEN:", token);
console.log("SESSIONS AFTER LOGIN:", [...activeSessions.keys()]);

    return res.json({ success: true, token, role: user.role, username: user.username });
  } else {
    return res.status(401).json({ error: "Invalid username or password." });
  }
});

// Logout endpoint
app.post("/api/auth/logout", (req, res) => {
  const { token } = req.body;
  if (token) {
    activeSessions.delete(token);
  }
  res.json({ success: true, message: "Logged out successfully" });
});

// --- User Management Endpoints (Super-Admin Only) ---

// Add user (admin/super-admin)
app.post("/api/users/add", authMiddleware, requireSuperAdmin, async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || username.trim().length < 3) {
    return res.status(400).json({ error: "Username must be at least 3 characters." });
  }
  if (!password || password.length < 4) {
    return res.status(400).json({ error: "Password must be at least 4 characters long." });
  }
  if (role !== "super-admin" && role !== "admin") {
    return res.status(400).json({ error: "Invalid role. Must be 'super-admin' or 'admin'." });
  }

  const db = await readDb();
  const newUsername = username.trim().toLowerCase();

  if (db.users?.some(u => u.username === newUsername)) {
    return res.status(400).json({ error: `User '${newUsername}' already exists.` });
  }

  const newUser: CuratorUser = {
    username: newUsername,
    passwordHash: hashPassword(password),
    role,
    createdAt: new Date().toISOString()
  };

  if (!db.users) db.users = [];
  db.users.push(newUser);
  await writeDb(db);

  const safeUsers = db.users.map(({ passwordHash, ...u }) => u);
  res.json({ success: true, message: `User '${newUsername}' added successfully.`, users: safeUsers });
});

// Delete user
app.post("/api/users/delete", authMiddleware, requireSuperAdmin, async (req: any, res: any) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ error: "Username is required." });
  }

  const db = await readDb();
  const targetUsername = username.trim().toLowerCase();

  const userToDelete = db.users?.find(u => u.username === targetUsername);
  if (!userToDelete) {
    return res.status(404).json({ error: "User not found." });
  }

  if (userToDelete.username === req.user.username) {
    return res.status(400).json({ error: "You cannot delete your own account." });
  }

  const superAdminsLeft = db.users?.filter(u => u.role === "super-admin" && u.username !== targetUsername);
  if (userToDelete.role === "super-admin" && (!superAdminsLeft || superAdminsLeft.length === 0)) {
    return res.status(400).json({ error: "Cannot delete the only remaining super-admin." });
  }

  db.users = db.users?.filter(u => u.username !== targetUsername);
  await writeDb(db);

  const safeUsers = db.users?.map(({ passwordHash, ...u }) => u) || [];
  res.json({ success: true, message: `User '${targetUsername}' deleted successfully.`, users: safeUsers });
});

// --- API Endpoints ---

// Get current configuration & state
app.get("/api/settings", authMiddleware, async (req: any, res: any) => {
  const db = await readDb();
  const isSuper = req.user?.role === "super-admin";
  
  const { passwordHash, users, ...safeDb } = db as any;
  const safeUsers = users ? users.map(({ passwordHash, ...u }: any) => u) : [];

  if (!isSuper && safeDb.destination) {
    // Mask botToken for normal admins
    if (safeDb.destination.botToken) {
      const len = safeDb.destination.botToken.length;
      if (len > 8) {
        safeDb.destination.botToken = "•".repeat(12) + safeDb.destination.botToken.slice(-4);
      } else {
        safeDb.destination.botToken = "••••••••••••";
      }
    }
  }

  res.json({
    ...safeDb,
    passwordSet: !!(users && users.length > 0),
    supabaseActive: isSupabaseConfigured,
    geminiActive: !!process.env.GEMINI_API_KEY,
    openrouterActive: !!process.env.OPENROUTER_API_KEY,
    ...(isSuper ? { users: safeUsers } : {})
  });
});

// Update configuration & state
app.post("/api/settings", authMiddleware, async (req: any, res: any) => {
  const incoming = req.body as Partial<CuratorSettings>;
  const db = await readDb();
  const isSuper = req.user.role === "super-admin";

  // Admins can only update posts, they are forbidden from modifying infrastructure config!
  if (!isSuper) {
    if (incoming.channels || incoming.filters || incoming.destination || incoming.aiConfig) {
      return res.status(403).json({ error: "Forbidden. Admins can only edit or approve posts. System configurations are locked." });
    }
  }

  if (incoming.channels && isSuper) db.channels = incoming.channels;
  if (incoming.filters && isSuper) db.filters = incoming.filters;
  if (incoming.destination && isSuper) db.destination = incoming.destination;
  if (incoming.aiConfig && isSuper) db.aiConfig = incoming.aiConfig;
  if (incoming.posts) db.posts = incoming.posts;

  await writeDb(db);

  const { passwordHash, users, ...safeDb } = db as any;
  const safeUsers = users ? users.map(({ passwordHash, ...u }: any) => u) : [];

  if (!isSuper && safeDb.destination) {
    if (safeDb.destination.botToken) {
      const len = safeDb.destination.botToken.length;
      if (len > 8) {
        safeDb.destination.botToken = "•".repeat(12) + safeDb.destination.botToken.slice(-4);
      } else {
        safeDb.destination.botToken = "••••••••••••";
      }
    }
  }

  res.json({
    ...safeDb,
    passwordSet: !!(users && users.length > 0),
    supabaseActive: isSupabaseConfigured,
    geminiActive: !!process.env.GEMINI_API_KEY,
    openrouterActive: !!process.env.OPENROUTER_API_KEY,
    ...(isSuper ? { users: safeUsers } : {})
  });
});

// --- Supabase Database Management Endpoints ---

// Check table existence and configuration status
app.get("/api/supabase/status", authMiddleware, async (req, res) => {
  const status = await checkTableExists();
  res.json({
    configured: isSupabaseConfigured,
    hasDirectDbUrl: !!process.env.DATABASE_URL,
    supabaseUrl: process.env.SUPABASE_URL || "",
    ...status
  });
});

// Setup/Bootstrap table on Supabase (using direct postgres connection) (super-admin only)
app.post("/api/supabase/setup-table", authMiddleware, requireSuperAdmin, async (req, res) => {
  const outcome = await autoCreateSettingsTable();
  res.json(outcome);
});

// Scrape target channels and parse posts
app.post("/api/fetch-posts", authMiddleware, async (req, res) => {
  const db = await readDb();
  const usernamesToFetch = req.body.usernames as string[] || db.channels.map(c => c.username);

  let newlyFetchedCount = 0;
  const currentPostsMap = new Map(db.posts.map(p => [p.id, p]));

  for (const username of usernamesToFetch) {
    const cleanUsername = username.trim().replace(/^@/, "").toLowerCase();
    if (!cleanUsername) continue;

    // Find channel config or create transient one
    let channelIdx = db.channels.findIndex(c => c.username.toLowerCase() === cleanUsername);
    if (channelIdx === -1) {
      db.channels.push({ username: cleanUsername, status: "fetching" });
      channelIdx = db.channels.length - 1;
    } else {
      db.channels[channelIdx].status = "fetching";
    }
    await writeDb(db);

    try {
      const url = `https://t.me/s/${cleanUsername}`;
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9"
        }
      });

      if (!response.ok) {
        throw new Error(`Telegram returned status ${response.status}`);
      }

      const html = await response.text();

      // Simple regex parser for public channel HTML blocks
      const messageBlocks = html.split('class="tgme_widget_message_wrap');
      // Skip the first split element as it is the page header
      messageBlocks.shift();

      let parsedCount = 0;

      for (const block of messageBlocks) {
        // Extract post id, e.g., data-post="techcrunch/1234"
        const postMatch = block.match(/data-post="([^"]+)"/);
        if (!postMatch) continue;
        const postId = postMatch[1]; // "username/1234"

        // Extract message text content
        let originalText = "";
        const textMatch = block.match(/<div class="tgme_widget_message_text[^"]*"[^>]* dir="auto">([\s\S]*?)<\/div>/) ||
                           block.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
        if (textMatch) {
          originalText = textMatch[1]
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)") // preserve links readable
            .replace(/<[^>]+>/g, "") // strip other HTML tags
            .trim();
        }

        // Extract actual Telegram media before deciding whether the post is empty.
        // Video source lives on .tgme_widget_message_video; its thumbnail is not the video.
        const videoUrl = extractTelegramVideoUrl(block);
        const photoUrl = extractTelegramPhotoUrl(block);
        const mediaType: CuratedPost['mediaType'] = videoUrl ? 'video' : photoUrl ? 'photo' : undefined;

        // Preserve media-only posts too. Text filters can still archive them when they
        // do not match configured keywords, but the collector must not discard them.
        if (!originalText && !photoUrl && !videoUrl) continue;

        // Extract date
        let date = new Date().toISOString();
        const dateMatch = block.match(/<time datetime="([^"]+)"/);
        if (dateMatch) {
          date = dateMatch[1];
        }

        // Apply keyword/hashtag rules
        const textToMatch = db.filters.caseSensitive ? originalText : originalText.toLowerCase();
        
        // Negative keywords check: if present, automatically archive/skip
        let containsNegative = false;
        for (const kw of db.filters.negativeKeywords) {
          const cleanKw = db.filters.caseSensitive ? kw : kw.toLowerCase();
          if (cleanKw && textToMatch.includes(cleanKw)) {
            containsNegative = true;
            break;
          }
        }

        let isMatch = false;
        if (!containsNegative) {
          // If no filters are defined, everything is a match
          if (db.filters.positiveKeywords.length === 0 && db.filters.requiredHashtags.length === 0) {
            isMatch = true;
          } else {
            // Check positive keywords
            for (const kw of db.filters.positiveKeywords) {
              const cleanKw = db.filters.caseSensitive ? kw : kw.toLowerCase();
              if (cleanKw && textToMatch.includes(cleanKw)) {
                isMatch = true;
                break;
              }
            }
            // Check required hashtags (as keywords with a #)
            if (!isMatch) {
              for (const hash of db.filters.requiredHashtags) {
                const cleanHash = db.filters.caseSensitive ? hash : hash.toLowerCase();
                const hashPrefix = cleanHash.startsWith("#") ? cleanHash : `#${cleanHash}`;
                if (textToMatch.includes(hashPrefix)) {
                  isMatch = true;
                  break;
                }
              }
            }
          }
        }

        const initialStatus = isMatch ? "pending" : "archived";

        // Create new curated posts, or self-heal only media data for existing posts.
        // This intentionally does not overwrite status, edits, AI output,
        // moderation state, or publish history.
        const existingPost = currentPostsMap.get(postId);
        if (!existingPost) {
          const newPost: CuratedPost = {
            id: postId,
            channelUsername: cleanUsername,
            originalText,
            text: originalText, // Copy original initially so the user can tweak it
            mediaType,
            photoUrl,
            videoUrl,
            date,
            url: `https://t.me/${postId}`,
            status: initialStatus
          };
          currentPostsMap.set(postId, newPost);
          newlyFetchedCount++;
        } else if (videoUrl) {
          // Existing video posts created before video support often stored the thumbnail
          // as photoUrl. Keep edits/status intact while attaching the authoritative video.
          existingPost.videoUrl = videoUrl;
          existingPost.mediaType = 'video';
          if (!photoUrl) {
            existingPost.photoUrl = undefined;
          }
        } else {
          const repairedPhotoUrl = repairLegacyPhotoUrl(existingPost.photoUrl, photoUrl);
          if (repairedPhotoUrl !== existingPost.photoUrl) {
            existingPost.photoUrl = repairedPhotoUrl;
          }
          if (repairedPhotoUrl) {
            existingPost.mediaType = 'photo';
          }
        }
        parsedCount++;
      }

      db.channels[channelIdx].status = "success";
      db.channels[channelIdx].lastFetched = new Date().toISOString();
      db.channels[channelIdx].errorMessage = undefined;

      // Extract nice display name from HTML if possible
      const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
      if (titleMatch && (!db.channels[channelIdx].name || db.channels[channelIdx].name === db.channels[channelIdx].username)) {
        db.channels[channelIdx].name = titleMatch[1];
      }

    } catch (err: any) {
      console.error(`Error fetching channel @${username}:`, err);
      db.channels[channelIdx].status = "error";
      db.channels[channelIdx].errorMessage = err.message || "Failed to scrape channel";
    }
  }

  // Convert map back to array, sort by date descending
  const updatedPosts = Array.from(currentPostsMap.values());
  updatedPosts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Convert to legacy storage (temporary until migration is complete)
db.posts = updatedPosts.slice(0, 400);
await writeDb(db);

// -------- NEW: Save posts into Supabase --------
try {
  const postEntities = db.posts.map(post => ({
    id: post.id,
    channel_username: post.channelUsername,
    original_text: post.originalText,
    edited_text: post.text,
    media_type: post.mediaType ?? null,
    photo_url: post.photoUrl ?? null,
    video_url: post.videoUrl ?? null,
    telegram_url: post.url,
    published_at: post.date,
    status: post.status,
  }));

  await postService.savePosts(postEntities);

  console.log(`Saved ${postEntities.length} posts to Supabase.`);
} catch (err) {
  console.error("Failed saving posts to Supabase:", err);
}
// -----------------------------------------------

const latestPosts = (await postService.getRecentPosts(400)).map((p: any) => ({
  id: p.id,
  channelUsername: p.channel_username,
  originalText: p.original_text,
  text: p.edited_text,
  mediaType: p.media_type,
  photoUrl: p.photo_url,
  videoUrl: p.video_url,
  date: p.published_at,
  url: p.telegram_url,
  status: p.status,
}));

res.json({
  channels: db.channels,
  posts: latestPosts,
  fetchedCount: newlyFetchedCount
});
});

// Trigger AI Content Curation (Gemini or OpenRouter)
app.post("/api/ai/curate", authMiddleware, async (req, res) => {
  const db = await readDb();
  const aiProvider = db.aiConfig?.provider || "gemini";
  const aiModel = db.aiConfig?.model || "gemini-3.5-flash";

  const { action, text, context } = req.body;
  if (!text) {
    return res.status(400).json({ error: "Missing post text" });
  }

  if (!isCurationAction(action)) {
    return res.status(400).json({ error: "Invalid curation action" });
  }

  const prompt = buildCurationPrompt(action, text, context);

  const result = await dispatchCuration({
    provider: aiProvider,
    model: aiModel,
    prompt,
    geminiClient: ai,
    geminiApiKey: process.env.GEMINI_API_KEY,
    openRouterApiKey: process.env.OPENROUTER_API_KEY
  });

  if (result.ok === false) {
    return res.status(result.status).json({ error: result.error });
  }

  res.json({ result: result.result });
});

// Post curated text directly to target Telegram channels via Telegram Bot API
app.post("/api/post-telegram", authMiddleware, async (req, res) => {
  const { postId, text, targetIds } = req.body;
  const db = await readDb();
  const { botToken, targets, channelId } = db.destination;

  if (!botToken) {
    return res.status(400).json({ error: "Bot Token is missing in configuration." });
  }

  const configuredTargets = Array.isArray(targets) ? targets : [];
  let activeTargets: DestinationTarget[] = [];

  if (targetIds !== undefined) {
    if (!Array.isArray(targetIds)) {
      return res.status(400).json({ error: "targetIds must be an array when provided." });
    }

    const hasMalformedTargetId = targetIds.some(
      (targetId: unknown) => typeof targetId !== "string" || targetId.trim().length === 0
    );
    if (hasMalformedTargetId) {
      return res.status(400).json({ error: "Every selected target ID must be a non-empty string." });
    }

    const requestedTargetIds = Array.from(
      new Set(targetIds.map((targetId: string) => targetId.trim()))
    );

    if (requestedTargetIds.length === 0) {
      return res.status(400).json({ error: "No Telegram targets were selected." });
    }

    const configuredById = new Map(configuredTargets.map(target => [target.id, target]));
    const unknownTargetIds = requestedTargetIds.filter(targetId => !configuredById.has(targetId));
    if (unknownTargetIds.length > 0) {
      return res.status(400).json({
        error: `Unknown Telegram target ID${unknownTargetIds.length === 1 ? "" : "s"}: ${unknownTargetIds.join(", ")}.`,
        invalidTargetIds: unknownTargetIds
      });
    }

    const disabledTargetIds = requestedTargetIds.filter(
      targetId => configuredById.get(targetId)?.enabled !== true
    );
    if (disabledTargetIds.length > 0) {
      return res.status(400).json({
        error: `Disabled Telegram target${disabledTargetIds.length === 1 ? "" : "s"} cannot be selected for publishing: ${disabledTargetIds.join(", ")}.`,
        disabledTargetIds
      });
    }

    const requestedTargetIdSet = new Set(requestedTargetIds);
    const seenTargetIds = new Set<string>();
    activeTargets = configuredTargets.filter(target => {
      if (!target.enabled || !requestedTargetIdSet.has(target.id) || seenTargetIds.has(target.id)) {
        return false;
      }
      seenTargetIds.add(target.id);
      return true;
    });
  } else {
    const seenTargetIds = new Set<string>();
    activeTargets = configuredTargets.filter(target => {
      if (!target.enabled || seenTargetIds.has(target.id)) {
        return false;
      }
      seenTargetIds.add(target.id);
      return true;
    });
  }

  // The legacy single-channel fallback is only for configurations that have never
  // migrated to destination.targets. Never bypass intentionally disabled targets.
  const legacyChannelId = typeof channelId === "string" ? channelId.trim() : "";
  if (
    targetIds === undefined &&
    activeTargets.length === 0 &&
    configuredTargets.length === 0 &&
    legacyChannelId
  ) {
    activeTargets = [{
      id: "legacy",
      channelId: legacyChannelId,
      name: "Default Target",
      enabled: true,
      status: "idle"
    }];
  }

  if (activeTargets.length === 0) {
    return res.status(400).json({ error: "No enabled Telegram targets found to publish to." });
  }

  // Find post in our DB
  const postIdx = db.posts.findIndex(p => p.id === postId);
  if (postIdx === -1) {
    return res.status(404).json({ error: "Curated post not found in database." });
  }

  const post = db.posts[postIdx];
  const formattedText = text || post.text;

  const results: { targetId: string; name: string; success: boolean; error?: string; warning?: string }[] = [];
  let atLeastOneSuccess = false;

  await Promise.all(activeTargets.map(async (target) => {
    const dbTargetIdx = db.destination.targets?.findIndex(t => t.id === target.id);
    const rawChannelId = typeof target.channelId === "string" ? target.channelId.trim() : "";

    if (!rawChannelId) {
      const error = "Target channel/group ID is empty.";
      results.push({ targetId: target.id, name: target.name, success: false, error });
      if (dbTargetIdx !== undefined && dbTargetIdx !== -1) {
        db.destination.targets[dbTargetIdx].status = "error";
        db.destination.targets[dbTargetIdx].errorMessage = error;
      }
      return;
    }

    let formattedChannelId = rawChannelId;
    if (!formattedChannelId.startsWith("@") && !formattedChannelId.startsWith("-") && isNaN(Number(formattedChannelId))) {
      formattedChannelId = `@${formattedChannelId}`;
    }

    try {
      let success = false;
      let responseData: any = null;
      let targetWarning: string | undefined;

      // Always use backend-stored media from the authoritative post record.
      // Prefer an actual video over any legacy thumbnail/photo field on video posts.
      const activeVideo = post.videoUrl;
      const activePhoto = post.photoUrl;
      if (activeVideo) {
        const sendVideoUrl = `https://api.telegram.org/bot${botToken}/sendVideo`;
        const captionParts = splitTelegramText(formattedText, 1000);
        const caption = captionParts.shift() || "";
        let downloadedVideo: Awaited<ReturnType<typeof mediaService.downloadVideoWithMetadata>> = null;
        let videoPublished = false;
        let mediaFailure = "";

        const parseTelegramResponse = async (telegramResponse: Response, context: string) => {
          const raw = await telegramResponse.text();
          try {
            return raw ? JSON.parse(raw) : {};
          } catch {
            return {
              ok: false,
              description: `Telegram returned an invalid response while ${context} (HTTP ${telegramResponse.status}).`
            };
          }
        };

        try {
          downloadedVideo = await mediaService.downloadVideoWithMetadata(activeVideo);
          if (!downloadedVideo) {
            throw new Error("Video download failed.");
          }

          const form = new FormData();
          form.append("chat_id", formattedChannelId);
          form.append("supports_streaming", "true");
          if (caption) {
            form.append("caption", caption);
          }

          const videoBuffer = fs.readFileSync(downloadedVideo.filepath);
          form.append(
            "video",
            new Blob([videoBuffer], { type: downloadedVideo.contentType }),
            downloadedVideo.filename
          );

          const videoRes = await fetchTelegramWithTimeout(sendVideoUrl, {
            method: "POST",
            body: form
          });

          responseData = await parseTelegramResponse(videoRes, "sending the video");
          if (videoRes.ok && responseData.ok) {
            videoPublished = true;
            success = true;

            // Video captions share Telegram's 1024-character caption limit. Send the
            // rest as ordinary plain-text messages so long posts remain intact.
            for (let chunkIndex = 0; chunkIndex < captionParts.length; chunkIndex++) {
              const continuationRes = await fetchTelegramWithTimeout(
                `https://api.telegram.org/bot${botToken}/sendMessage`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    chat_id: formattedChannelId,
                    text: captionParts[chunkIndex],
                    disable_web_page_preview: false
                  })
                }
              );

              const continuationData = await parseTelegramResponse(continuationRes, "sending video continuation text");
              if (!continuationRes.ok || !continuationData.ok) {
                success = false;
                const telegramError = continuationData.description || "Unknown Telegram continuation error";
                responseData = {
                  ok: false,
                  description: `Video published, but continuation chunk ${chunkIndex + 1}/${captionParts.length} failed: ${telegramError}`
                };
                break;
              }
            }
          } else {
            mediaFailure = responseData.description || "Telegram rejected the video upload.";
          }
        } catch (err: any) {
          mediaFailure = err.message || "Telegram video publishing failed.";
        } finally {
          mediaService.deleteTemp(downloadedVideo?.filepath);
        }

        if (!videoPublished && !success) {
          const fallbackText = formattedText.trim()
            ? `${formattedText}\n\nVideo: ${post.url}`
            : `Video: ${post.url}`;
          const fallbackChunks = splitTelegramText(fallbackText);
          const sendMsgUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
          let fallbackSucceeded = fallbackChunks.length > 0;

          for (let chunkIndex = 0; chunkIndex < fallbackChunks.length; chunkIndex++) {
            const fallbackRes = await fetchTelegramWithTimeout(sendMsgUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: formattedChannelId,
                text: fallbackChunks[chunkIndex],
                disable_web_page_preview: false
              })
            });

            const fallbackData = await parseTelegramResponse(fallbackRes, "sending the video text fallback");
            if (!fallbackRes.ok || !fallbackData.ok) {
              fallbackSucceeded = false;
              const telegramError = fallbackData.description || "Unknown Telegram fallback error";
              responseData = {
                ok: false,
                description: `Video publish failed: ${mediaFailure || "unknown media error"}. Text fallback chunk ${chunkIndex + 1}/${fallbackChunks.length} also failed: ${telegramError}`
              };
              break;
            }
          }

          if (fallbackSucceeded) {
            success = true;
            targetWarning = `Video was not attached; text fallback was published instead: ${mediaFailure || "Telegram video upload failed."}`;
            responseData = { ok: true };
          }
        }
      } else if (activePhoto) {
        const sendPhotoUrl = `https://api.telegram.org/bot${botToken}/sendPhoto`;
        const captionParts = splitTelegramText(formattedText, 1000);
        const caption = captionParts.shift() || "";
        let downloadedImage: Awaited<ReturnType<typeof mediaService.downloadImageWithMetadata>> = null;
        let photoPublished = false;
        let mediaFailure = "";

        const parseTelegramResponse = async (telegramResponse: Response, context: string) => {
          const raw = await telegramResponse.text();
          try {
            return raw ? JSON.parse(raw) : {};
          } catch {
            return {
              ok: false,
              description: `Telegram returned an invalid response while ${context} (HTTP ${telegramResponse.status}).`
            };
          }
        };

        try {
          downloadedImage = await mediaService.downloadImageWithMetadata(activePhoto);
          if (!downloadedImage) {
            throw new Error("Image download failed.");
          }

          const form = new FormData();
          form.append("chat_id", formattedChannelId);
          if (caption) {
            form.append("caption", caption);
          }

          const imageBuffer = fs.readFileSync(downloadedImage.filepath);
          form.append(
            "photo",
            new Blob([imageBuffer], { type: downloadedImage.contentType }),
            downloadedImage.filename
          );

          const photoRes = await fetchTelegramWithTimeout(sendPhotoUrl, {
            method: "POST",
            body: form
          });

          responseData = await parseTelegramResponse(photoRes, "sending the photo");
          if (photoRes.ok && responseData.ok) {
            photoPublished = true;
            success = true;

            // Telegram photo captions are limited to 1024 characters. Any remaining
            // text is sent as plain continuation messages without parse_mode.
            for (let chunkIndex = 0; chunkIndex < captionParts.length; chunkIndex++) {
              const continuationRes = await fetchTelegramWithTimeout(
                `https://api.telegram.org/bot${botToken}/sendMessage`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    chat_id: formattedChannelId,
                    text: captionParts[chunkIndex],
                    disable_web_page_preview: false
                  })
                }
              );

              const continuationData = await parseTelegramResponse(continuationRes, "sending photo continuation text");
              if (!continuationRes.ok || !continuationData.ok) {
                success = false;
                const telegramError = continuationData.description || "Unknown Telegram continuation error";
                responseData = {
                  ok: false,
                  description: `Photo published, but continuation chunk ${chunkIndex + 1}/${captionParts.length} failed: ${telegramError}`
                };
                break;
              }
            }
          } else {
            mediaFailure = responseData.description || "Telegram rejected the photo upload.";
          }
        } catch (err: any) {
          mediaFailure = err.message || "Telegram photo publishing failed.";
        } finally {
          mediaService.deleteTemp(downloadedImage?.filepath);
        }

        // If the photo itself was never published, preserve the post content by falling
        // back to plain text plus the stored Telegram media URL. Keep the warning in the
        // per-target result so callers can distinguish a true photo publish from fallback.
        if (!photoPublished && !success) {
          const fallbackText = formattedText.trim()
            ? `${formattedText}\n\nPhoto: ${activePhoto}`
            : `Photo: ${activePhoto}`;
          const fallbackChunks = splitTelegramText(fallbackText);
          const sendMsgUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
          let fallbackSucceeded = fallbackChunks.length > 0;

          for (let chunkIndex = 0; chunkIndex < fallbackChunks.length; chunkIndex++) {
            const fallbackRes = await fetchTelegramWithTimeout(sendMsgUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: formattedChannelId,
                text: fallbackChunks[chunkIndex],
                disable_web_page_preview: false
              })
            });

            const fallbackData = await parseTelegramResponse(fallbackRes, "sending the photo text fallback");
            if (!fallbackRes.ok || !fallbackData.ok) {
              fallbackSucceeded = false;
              const telegramError = fallbackData.description || "Unknown Telegram fallback error";
              responseData = {
                ok: false,
                description: `Photo publish failed: ${mediaFailure || "unknown media error"}. Text fallback chunk ${chunkIndex + 1}/${fallbackChunks.length} also failed: ${telegramError}`
              };
              break;
            }
          }

          if (fallbackSucceeded) {
            success = true;
            targetWarning = `Photo was not attached; text fallback was published instead: ${mediaFailure || "Telegram photo upload failed."}`;
            responseData = { ok: true };
          }
        }
      } else {
        // Text-only publishing intentionally avoids parse_mode. Curated/user text can
        // contain literal <, >, &, or model-generated markup that is not valid Telegram HTML.
        const textChunks = splitTelegramText(formattedText);
        if (textChunks.length === 0) {
          throw new Error("Cannot publish an empty text post.");
        }

        const sendMsgUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
        for (let chunkIndex = 0; chunkIndex < textChunks.length; chunkIndex++) {
          const textRes = await fetchTelegramWithTimeout(sendMsgUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: formattedChannelId,
              text: textChunks[chunkIndex],
              disable_web_page_preview: false
            })
          });

          const rawTextResponse = await textRes.text();
          try {
            responseData = rawTextResponse ? JSON.parse(rawTextResponse) : {};
          } catch {
            responseData = {
              ok: false,
              description: `Telegram returned an invalid response while sending text chunk ${chunkIndex + 1}/${textChunks.length}.`
            };
          }

          if (!textRes.ok || !responseData.ok) {
            const telegramError = responseData.description || "Unknown Telegram text publishing error";
            responseData = {
              ...responseData,
              description: `Text chunk ${chunkIndex + 1}/${textChunks.length} failed: ${telegramError}`
            };
            break;
          }

          if (chunkIndex === textChunks.length - 1) {
            success = true;
          }
        }
      }

      if (success) {
        results.push({
          targetId: target.id,
          name: target.name,
          success: true,
          ...(targetWarning ? { warning: targetWarning } : {})
        });
        atLeastOneSuccess = true;
        if (dbTargetIdx !== undefined && dbTargetIdx !== -1) {
          db.destination.targets[dbTargetIdx].status = "success";
          db.destination.targets[dbTargetIdx].errorMessage = undefined;
        }
      } else {
        const errDesc = responseData ? responseData.description : "Unknown error response from Telegram";
        results.push({ targetId: target.id, name: target.name, success: false, error: errDesc });
        if (dbTargetIdx !== undefined && dbTargetIdx !== -1) {
          db.destination.targets[dbTargetIdx].status = "error";
          db.destination.targets[dbTargetIdx].errorMessage = errDesc;
        }
      }
    } catch (err: any) {
      console.error(`Error posting to target ${target.name}:`, err);
      results.push({ targetId: target.id, name: target.name, success: false, error: err.message });
      if (dbTargetIdx !== undefined && dbTargetIdx !== -1) {
        db.destination.targets[dbTargetIdx].status = "error";
        db.destination.targets[dbTargetIdx].errorMessage = err.message;
      }
    }
  }));

  // Promise completion order is nondeterministic; restore configured target order for callers.
  const targetOrder = new Map(activeTargets.map((target, index) => [target.id, index]));
  results.sort(
    (a, b) => (targetOrder.get(a.targetId) ?? Number.MAX_SAFE_INTEGER) -
      (targetOrder.get(b.targetId) ?? Number.MAX_SAFE_INTEGER)
  );

  const successCount = results.filter(result => result.success).length;
  const failureCount = results.length - successCount;
  const warningCount = results.filter(result => !!result.warning).length;
  atLeastOneSuccess = successCount > 0;
  const outcome: "success" | "partial" | "failure" =
    successCount === results.length
      ? "success"
      : successCount > 0
        ? "partial"
        : "failure";

  if (atLeastOneSuccess) {
    // Update post status to posted
    db.posts[postIdx].status = "posted";
    db.posts[postIdx].text = formattedText; // save latest text edited
    db.posts[postIdx].postedAt = new Date().toISOString();
    
    // Check if there were any partial failures
    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
      db.posts[postIdx].errorMessage = `Published to some targets. Failures: ${failures.map(f => `${f.name}: ${f.error}`).join("; ")}`;
    } else {
      db.posts[postIdx].errorMessage = undefined;
    }
  } else {
    db.posts[postIdx].errorMessage = `Failed to publish to all selected targets. Errors: ${results.map(r => `${r.name}: ${r.error}`).join("; ")}`;
  }

  // Mark destination as connected since we had at least one success or validated targets
  db.destination.connected = atLeastOneSuccess || db.destination.connected;

  await writeDb(db);
  return res.json({
    success: atLeastOneSuccess,
    outcome,
    summary: {
      total: results.length,
      succeeded: successCount,
      failed: failureCount,
      warnings: warningCount
    },
    post: db.posts[postIdx],
    results,
    destination: db.destination
  });
});

// Test bot connectivity in stages so configuration errors are easy to diagnose.
app.post("/api/test-bot", authMiddleware, async (req, res) => {
  const botToken = typeof req.body?.botToken === "string" ? req.body.botToken.trim() : "";
  const channelId = typeof req.body?.channelId === "string" ? req.body.channelId.trim() : "";

  if (!botToken || !channelId) {
    return res.status(400).json({
      success: false,
      stage: "input",
      error: "Bot Token and Channel ID are required."
    });
  }

  let formattedChannelId = channelId;
  if (!formattedChannelId.startsWith("@") && !formattedChannelId.startsWith("-") && isNaN(Number(formattedChannelId))) {
    formattedChannelId = `@${formattedChannelId}`;
  }

  const callTelegram = async (method: string, payload: Record<string, unknown> = {}) => {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const rawBody = await response.text();
    let data: any = {};
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      data = {
        ok: false,
        description: `Telegram returned an invalid response (HTTP ${response.status}).`
      };
    }

    return { response, data };
  };

  try {
    // 1) Validate the bot token and identify the bot account.
    const botCheck = await callTelegram("getMe");
    if (!botCheck.response.ok || !botCheck.data.ok) {
      return res.status(400).json({
        success: false,
        stage: "bot",
        error: `Bot token validation failed: ${botCheck.data.description || "Telegram rejected the bot token."}`
      });
    }

    const bot = botCheck.data.result;

    // 2) Verify that Telegram can resolve the configured target.
    const chatCheck = await callTelegram("getChat", { chat_id: formattedChannelId });
    if (!chatCheck.response.ok || !chatCheck.data.ok) {
      return res.status(400).json({
        success: false,
        stage: "target",
        error: `Target validation failed for ${formattedChannelId}: ${chatCheck.data.description || "Telegram could not resolve this chat."}`,
        bot: {
          id: bot.id,
          username: bot.username,
          firstName: bot.first_name
        }
      });
    }

    const chat = chatCheck.data.result;

    // 3) Inspect membership/admin rights when Telegram can provide them.
    // Telegram documents getChatMember as guaranteed for other users only when
    // the bot is an administrator, so a failed membership lookup is not treated
    // as final; the real send test below remains authoritative.
    const memberCheck = await callTelegram("getChatMember", {
      chat_id: formattedChannelId,
      user_id: bot.id
    });

    let permissions: any = undefined;
    if (memberCheck.response.ok && memberCheck.data.ok) {
      const member = memberCheck.data.result;
      permissions = {
        status: member.status,
        canPostMessages: member.can_post_messages
      };

      if (member.status === "left" || member.status === "kicked") {
        return res.status(400).json({
          success: false,
          stage: "permissions",
          error: `The bot is not an active member of ${formattedChannelId}. Add the bot to the target before publishing.`
        });
      }

      if (chat.type === "channel" && member.status !== "administrator" && member.status !== "creator") {
        return res.status(400).json({
          success: false,
          stage: "permissions",
          error: `The bot is not an administrator of ${formattedChannelId}. Channel publishing requires bot administrator access.`
        });
      }

      if (chat.type === "channel" && member.status === "administrator" && member.can_post_messages === false) {
        return res.status(400).json({
          success: false,
          stage: "permissions",
          error: `The bot is an administrator of ${formattedChannelId}, but it does not have permission to post messages.`
        });
      }
    }

    // 4) Perform the definitive permission check by publishing a quiet test message.
    const sendCheck = await callTelegram("sendMessage", {
      chat_id: formattedChannelId,
      text: "🤖 Telegram Content Curator connection test successful.",
      disable_notification: true
    });

    if (!sendCheck.response.ok || !sendCheck.data.ok) {
      return res.status(400).json({
        success: false,
        stage: "send",
        error: `Telegram could not publish to ${formattedChannelId}: ${sendCheck.data.description || "Message delivery failed."}`,
        bot: {
          id: bot.id,
          username: bot.username,
          firstName: bot.first_name
        },
        target: {
          id: chat.id,
          title: chat.title,
          username: chat.username,
          type: chat.type
        },
        permissions
      });
    }

    return res.json({
      success: true,
      message: `Verification successful! Test message published to ${formattedChannelId}.`,
      bot: {
        id: bot.id,
        username: bot.username,
        firstName: bot.first_name
      },
      target: {
        id: chat.id,
        title: chat.title,
        username: chat.username,
        type: chat.type
      },
      permissions
    });
  } catch (err: any) {
    console.error("Telegram bot connection test failed:", err);
    return res.status(502).json({
      success: false,
      stage: "network",
      error: err.message || "Could not reach the Telegram Bot API."
    });
  }
});

// Serve static Vite files in production, else mount development Vite server middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.post("/api/test-download", async (req, res) => {
  try {
    console.log("TEST DOWNLOAD START");

    const { url } = req.body;
    console.log("URL:", url);

    const file = await mediaService.downloadImage(url);

    console.log("DOWNLOADED:", file);

    res.json({
      success: true,
      file,
    });
  } catch (err: any) {
    console.error("TEST DOWNLOAD ERROR:", err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Telegram Content Curator running on http://localhost:${PORT}`);
  });
}

startServer();
