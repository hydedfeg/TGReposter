import mediaService from "./server/services/mediaService";
import postService from "./server/services/postService";
import channelRoutes from "./server/routes/channels";
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
  photoUrl?: string;
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
    hostname === "cdn4.telegram-cdn.org" ||
    hostname.endsWith(".telegram-cdn.org") ||
    hostname === "t.me" ||
    hostname === "telegram.org"
  );
}

function extractTelegramPhotoUrl(block: string): string | undefined {
  const mediaUrlMatches = [
    // Prefer Telegram's actual message photo wrapper instead of any image/style in the post.
    block.match(/tgme_widget_message_photo_wrap[^"]*"[^>]*style="[^"]*background-image:\s*url\(['"]?([^'")]+)['"]?\)/),
    block.match(/tgme_widget_message_video_thumb[^"]*"[^>]*style="[^"]*background-image:\s*url\(['"]?([^'")]+)['"]?\)/),
  ];

  for (const match of mediaUrlMatches) {
    const normalizedUrl = normalizeTelegramMediaUrl(match?.[1]);
    if (isValidTelegramPostMediaUrl(normalizedUrl)) {
      return normalizedUrl;
    }
  }

  // Backwards-compatible fallback for older Telegram markup, but reject avatars,
  // emoji images, and decorative icons before assigning photoUrl.
  const backgroundImageMatches = block.matchAll(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/g);
  for (const match of backgroundImageMatches) {
    const nearbyMarkup = block.slice(Math.max(0, (match.index ?? 0) - 200), match.index);
    if (nearbyMarkup.includes("tgme_widget_message_owner_photo")) continue;

    const normalizedUrl = normalizeTelegramMediaUrl(match[1]);
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

        // If post has no text, skip or provide empty placeholder
        if (!originalText) continue;

        // Extract date
        let date = new Date().toISOString();
        const dateMatch = block.match(/<time datetime="([^"]+)"/);
        if (dateMatch) {
          date = dateMatch[1];
        }

        // Extract image photo URL. Telegram embeds emoji/decorative assets in post
        // HTML too, so only keep URLs that validate as actual post media.
        const photoUrl = extractTelegramPhotoUrl(block);

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

        // Create new curated posts, or self-heal only legacy media data for
        // existing posts created before the emoji-media extraction fix. This
        // intentionally does not overwrite status, edits, AI output,
        // moderation state, or publish history.
        const existingPost = currentPostsMap.get(postId);
        if (!existingPost) {
          const newPost: CuratedPost = {
            id: postId,
            channelUsername: cleanUsername,
            originalText,
            text: originalText, // Copy original initially so the user can tweak it
            photoUrl,
            date,
            url: `https://t.me/${postId}`,
            status: initialStatus
          };
          currentPostsMap.set(postId, newPost);
          newlyFetchedCount++;
        } else {
          const repairedPhotoUrl = repairLegacyPhotoUrl(existingPost.photoUrl, photoUrl);
          if (repairedPhotoUrl !== existingPost.photoUrl) {
            existingPost.photoUrl = repairedPhotoUrl;
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
    photo_url: post.photoUrl ?? null,
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
  photoUrl: p.photo_url,
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

  let prompt = "";
  if (action === "rephrase") {
    const tone = context || "professional and engaging";
    prompt = `You are an expert Telegram channel editor. Rephrase this post to sound ${tone}. Ensure the writing is concise, captures readers' interest instantly, preserves any external URL links, and is formatted nicely for reading. Respond with ONLY the finalized text, no conversational introductions or explanations.\n\nPost:\n${text}`;
  } else if (action === "summarize") {
    prompt = `You are a professional news summarizer. Write a highly scannable, engaging 1-2 sentence summary of this post. Respond with ONLY the summary content, no intros, no quotes.\n\nPost:\n${text}`;
  } else if (action === "hashtags") {
    prompt = `Generate 3 to 6 highly relevant, catchy hashtags based on the content of this post. Output them on a single line, space-separated, with '#' characters. Do not include any other text.\n\nPost:\n${text}`;
  } else if (action === "translate") {
    const targetLang = context || "English";
    prompt = `Translate the following Telegram post into ${targetLang}. Retain the original layout, bullet points, and any link URLs. Respond with ONLY the translated text, no meta-comments.\n\nPost:\n${text}`;
  } else {
    return res.status(400).json({ error: "Invalid curation action" });
  }

  if (aiProvider === "gemini") {
    if (!process.env.GEMINI_API_KEY || !ai) {
      return res.status(400).json({
        error: "Gemini API Key is missing. Please add GEMINI_API_KEY in the Secrets panel."
      });
    }

    try {
      const response = await ai.models.generateContent({
        model: aiModel,
        contents: prompt,
      });

      const resultText = response.text?.trim() || "";
      res.json({ result: resultText });
    } catch (err: any) {
      console.error("Gemini curation error:", err);
      res.status(500).json({ error: err.message || "Gemini API call failed" });
    }
  } else if (aiProvider === "openrouter") {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(400).json({
        error: "OpenRouter API Key is missing. Please add OPENROUTER_API_KEY in the Secrets panel."
      });
    }

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ai.studio/build",
          "X-Title": "Telegram Curator"
        },
        body: JSON.stringify({
          model: aiModel,
          messages: [
            {
              role: "user",
              content: prompt
            }
          ]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("OpenRouter API returned error:", response.status, errorText);
        let errorMsg = "OpenRouter API call failed";
        try {
          const parsedError = JSON.parse(errorText);
          if (parsedError.error?.message) {
            errorMsg = parsedError.error.message;
          }
        } catch (_) {}
        return res.status(500).json({ error: `${errorMsg} (${response.status})` });
      }

      const data = (await response.json()) as any;
      const resultText = data.choices?.[0]?.message?.content?.trim() || "";
      res.json({ result: resultText });
    } catch (err: any) {
      console.error("OpenRouter curation error:", err);
      res.status(500).json({ error: err.message || "OpenRouter connection failed" });
    }
  } else {
    res.status(400).json({ error: `Unsupported AI Provider: ${aiProvider}` });
  }
});

// Post curated text directly to target Telegram channels via Telegram Bot API
app.post("/api/post-telegram", authMiddleware, async (req, res) => {
  const { postId, text, photoUrl, targetIds } = req.body;
  const db = await readDb();
  const { botToken, targets, channelId } = db.destination;

  if (!botToken) {
    return res.status(400).json({ error: "Bot Token is missing in configuration." });
  }

  // Identify active targets to post to
  let activeTargets = targets ? targets.filter(t => t.enabled) : [];
  
  if (targetIds && Array.isArray(targetIds)) {
    activeTargets = targets.filter(t => targetIds.includes(t.id));
  }

  // Fallback to old single channelId configuration if targets array is empty
  if (activeTargets.length === 0 && channelId) {
    activeTargets = [{
      id: "legacy",
      channelId: channelId,
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

  const results: { targetId: string; name: string; success: boolean; error?: string }[] = [];
  let atLeastOneSuccess = false;

  for (const target of activeTargets) {
    let formattedChannelId = target.channelId.trim();
    if (!formattedChannelId.startsWith("@") && !formattedChannelId.startsWith("-") && isNaN(Number(formattedChannelId))) {
      formattedChannelId = `@${formattedChannelId}`;
    }

    try {
      let success = false;
      let responseData: any = null;

      // Format photo payload if photo URL exists
      if (photoUrl || post.photoUrl) {
        const activePhoto = photoUrl || post.photoUrl;
        const sendPhotoUrl = `https://api.telegram.org/bot${botToken}/sendPhoto`;
        const caption =
  formattedText.length > 1024
    ? formattedText.slice(0, 1020) + "..."
    : formattedText;

const tempFile = await mediaService.downloadImage(activePhoto);

if (!tempFile) {
  throw new Error("Image download failed.");
}

const form = new FormData();

form.append("chat_id", formattedChannelId);
form.append("caption", caption);
form.append("parse_mode", "HTML");
const imageBuffer = fs.readFileSync(tempFile);

form.append(
  "photo",
  new Blob([imageBuffer], { type: "image/jpeg" }),
  "image.jpg"
);

const photoRes = await fetch(sendPhotoUrl, {
  method: "POST",
  body: form
});

mediaService.deleteTemp(tempFile);

        console.log("Photo response status:", photoRes.status);
console.log("Photo response content-type:", photoRes.headers.get("content-type"));

const rawResponse = await photoRes.text();

console.log("Photo raw response:", rawResponse);

responseData = rawResponse ? JSON.parse(rawResponse) : {};
        if (photoRes.ok && responseData.ok) {
    success = true;

    if (formattedText.length > 1024) {
        const remaining = formattedText.slice(1020);

        await fetch(
            `https://api.telegram.org/bot${botToken}/sendMessage`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    chat_id: formattedChannelId,
                    text: remaining,
                    parse_mode: "HTML"
                })
            }
        );
    }
} else {
          console.error("========== TELEGRAM SENDPHOTO ERROR ==========");
console.error("Target:", target.name);
console.error("Photo URL:", activePhoto);
console.error("Telegram response:", JSON.stringify(responseData, null, 2));
console.error("==============================================");
          // Fallback to text message if photo posting fails
          const sendMsgUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
          const textFallbackRes = await fetch(sendMsgUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: formattedChannelId,
              text: `${formattedText}\n\n<i>(Photo attachments: ${activePhoto})</i>`,
              parse_mode: "HTML",
              disable_web_page_preview: false
            })
          });

          responseData = await textFallbackRes.json();
          if (textFallbackRes.ok && responseData.ok) {
            success = true;
          }
        }
      } else {
        // Send normal text message
        const sendMsgUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const textRes = await fetch(sendMsgUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: formattedChannelId,
            text: formattedText,
            parse_mode: "HTML",
            disable_web_page_preview: false
          })
        });

        responseData = await textRes.json();
        if (textRes.ok && responseData.ok) {
          success = true;
        }
      }

      const dbTargetIdx = db.destination.targets?.findIndex(t => t.id === target.id);

      if (success) {
        results.push({ targetId: target.id, name: target.name, success: true });
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
      const dbTargetIdx = db.destination.targets?.findIndex(t => t.id === target.id);
      if (dbTargetIdx !== undefined && dbTargetIdx !== -1) {
        db.destination.targets[dbTargetIdx].status = "error";
        db.destination.targets[dbTargetIdx].errorMessage = err.message;
      }
    }
  }

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
    post: db.posts[postIdx],
    results,
    destination: db.destination
  });
});

// Test bot connectivity
app.post("/api/test-bot", authMiddleware, async (req, res) => {
  const { botToken, channelId } = req.body;
  if (!botToken || !channelId) {
    return res.status(400).json({ error: "Missing Bot Token or Channel ID" });
  }

  let formattedChannelId = channelId.trim();
  if (!formattedChannelId.startsWith("@") && !formattedChannelId.startsWith("-") && isNaN(Number(formattedChannelId))) {
    formattedChannelId = `@${formattedChannelId}`;
  }

  try {
    const testMsgUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(testMsgUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: formattedChannelId,
        text: `🤖 <b>Telegram Content Curator Connected!</b>\n\nYour connection to this channel/group has been verified successfully. Date: ${new Date().toLocaleString()}`,
        parse_mode: "HTML"
      })
    });

    const data = await response.json();
    if (response.ok && data.ok) {
      res.json({ success: true, message: `Verification successful! Test message published to ${formattedChannelId}.` });
    } else {
      res.status(400).json({ error: data.description || "Verification failed" });
    }
  } catch (err: any) {
    console.error("Test bot error:", err);
    res.status(500).json({ error: err.message || "Connection failed to Telegram API" });
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
