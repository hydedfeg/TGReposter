import mediaService from "./server/services/mediaService";
import postService from "./server/services/postService";
import telegramPublisherService from "./server/services/telegramPublisherService";
import channelRoutes from "./server/routes/channels";
import { ChannelRepository } from "./server/repositories/channelRepository";
import { createPromotionRouter } from "./server/routes/promotion";
import { buildCurationPrompt, isCurationAction } from "./server/ai/curationPrompt";
import { dispatchCuration } from "./server/ai/curationDispatcher";
import { isValidInboxCronSecret } from "./server/services/cronAuthService";
import { getDatabaseHealth } from "./server/services/databaseHealthService";
import { getMainTelegramBotToken, getUserTelegramBotToken, saveMainTelegramBotToken, saveUserTelegramBotToken } from "./server/services/telegramCredentialService";
import { destinationOwnerPrincipalForUser, getUserDestinationConfig, saveUserDestinationTargets, updateUserDestinationStatuses } from "./server/services/userDestinationService";
import { getUserInboxPost, getUserInboxPosts, saveUserInboxPosts } from "./server/services/userInboxService";
import { countActiveSupabaseAppUsers, countActiveSupabaseSuperAdmins, createSupabaseAppUser, findSupabaseAppUser, listSupabaseAppUsers, revokeSupabaseAppUser, signInWithSupabasePassword, validateSupabaseAccessToken } from "./server/services/appAuthService";
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
const channelRepository = new ChannelRepository();

// Shared interfaces match src/types.ts
interface SourceChannel {
  username: string;
  name?: string;
  enabled?: boolean;
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
  botTokenConfigured?: boolean;
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

// Authentication Middleware
const authMiddleware = async (req: any, res: any, next: any) => {
  try {
    // Local-only bootstrap compatibility for the existing integration harness.
    // Production Railway always has DATABASE_URL + SUPABASE_URL, so this path
    // cannot make deployed routes public.
    if (!process.env.DATABASE_URL && !process.env.SUPABASE_URL) {
      const localDb = await readDb();
      if (!localDb.users || localDb.users.length === 0) {
        return next();
      }
    }

    const authHeader = req.headers.authorization;
    const token =
      typeof authHeader === "string" && authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length).trim()
        : "";

    if (!token) {
      return res.status(401).json({ error: "Unauthorized. Please log in." });
    }

    // Supabase-issued JWTs are the preferred session source. RBAC comes from
    // public.profiles, never from client-provided role metadata.
    try {
      const supabaseUser = await validateSupabaseAccessToken(token);
      if (supabaseUser) {
        req.user = supabaseUser;
        return next();
      }
    } catch (error) {
      console.error("Supabase session validation failed:", error);
    }

    // Transitional compatibility for existing in-memory sessions. This can be
    // removed after legacy accounts have been migrated.
    const legacySession = activeSessions.get(token);
    if (legacySession) {
      req.user = { ...legacySession, authProvider: "legacy" };
      return next();
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

const authOrCronMiddleware = async (req: any, res: any, next: any) => {
  try {
    if (await isValidInboxCronSecret(req.get("x-cron-secret"))) {
      req.user = { username: "system:cron", role: "super-admin" };
      return next();
    }
  } catch (error) {
    console.error("Cron authentication lookup failed:", error);
  }

  return authMiddleware(req, res, next);
};

// Source-channel configuration is infrastructure state and must never be
// exposed as an unauthenticated database route.
app.use("/api/channels", authMiddleware, requireSuperAdmin, channelRoutes);

// Promotion configuration is server-owned and mounted only after authentication
// middleware exists. Bot-account mutations and target configuration are further
// restricted by the promotion router to super-admins.
app.use("/api/promotion", createPromotionRouter({
  authMiddleware,
  requireSuperAdmin,
  readLegacySettings: readDb,
}));

// --- Authentication Endpoints ---

// Check authentication status
app.post("/api/auth/status", async (req, res) => {
  const db = await readDb();
  const legacyUsersExist = !!(db.users && db.users.length > 0);
  const supabaseUsersExist = (await countActiveSupabaseAppUsers()) > 0;
  const token =
    typeof req.body?.token === "string"
      ? req.body.token.trim()
      : "";

  let session: any = null;

  if (token) {
    try {
      session = await validateSupabaseAccessToken(token);
    } catch (error) {
      console.error("Supabase auth status validation failed:", error);
    }

    if (!session) {
      const legacy = activeSessions.get(token);
      if (legacy) {
        session = { ...legacy, authProvider: "legacy" };
      }
    }
  }

  res.json({
    passwordSet: legacyUsersExist || supabaseUsersExist,
    authenticated: !!session,
    role: session?.role ?? null,
    username: session?.username ?? null,
    authProvider: session?.authProvider ?? null,
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
  const legacyUsersExist = !!(db.users && db.users.length > 0);
  const supabaseUsersExist = (await countActiveSupabaseAppUsers()) > 0;

  if (!legacyUsersExist && !supabaseUsersExist) {
    return res.status(400).json({ error: "No accounts configured. Please set up owner credentials." });
  }

  const identity =
    typeof req.body?.username === "string"
      ? req.body.username.trim()
      : "";
  const password =
    typeof req.body?.password === "string"
      ? req.body.password
      : "";

  if (!identity || !password) {
    return res.status(400).json({ error: "Username/email and password are required." });
  }

  // Email identities authenticate directly with Supabase Auth.
  if (identity.includes("@")) {
    try {
      const result = await signInWithSupabasePassword(identity, password);
      if (result) {
        return res.json({
          success: true,
          token: result.token,
          refreshToken: result.refreshToken,
          expiresIn: result.expiresIn,
          role: result.user.role,
          username: result.user.username,
          email: result.user.email,
          authProvider: "supabase",
        });
      }
    } catch (error: any) {
      return res.status(401).json({
        error: error?.message || "Invalid email or password.",
      });
    }
  }

  // Legacy usernames remain valid during the migration window.
  const checkUser = identity.toLowerCase();
  const user = db.users?.find(u => u.username === checkUser);

  if (!user) {
    return res.status(401).json({ error: "Invalid username/email or password." });
  }

  const hash = hashPassword(password);
  if (hash !== user.passwordHash) {
    return res.status(401).json({ error: "Invalid username/email or password." });
  }

  const token = crypto.randomBytes(32).toString("hex");
  activeSessions.set(token, { username: user.username, role: user.role });

  return res.json({
    success: true,
    token,
    role: user.role,
    username: user.username,
    authProvider: "legacy",
  });
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
  const identity =
    typeof req.body?.username === "string"
      ? req.body.username.trim()
      : "";
  const password =
    typeof req.body?.password === "string"
      ? req.body.password
      : "";
  const role = req.body?.role;

  if (!identity || identity.length < 3) {
    return res.status(400).json({ error: "Username or email must be at least 3 characters." });
  }

  if (role !== "super-admin" && role !== "admin") {
    return res.status(400).json({ error: "Invalid role. Must be 'super-admin' or 'admin'." });
  }

  // New email-based accounts are provisioned in Supabase Auth. Legacy username
  // creation remains available only during the migration window.
  if (identity.includes("@")) {
    try {
      const created = await createSupabaseAppUser({
        email: identity,
        password,
        role,
      });
      const db = await readDb();
      const legacyUsers = (db.users ?? []).map(({ passwordHash, ...user }) => ({
        ...user,
        authProvider: "legacy",
      }));
      const supabaseUsers = await listSupabaseAppUsers();

      return res.json({
        success: true,
        message: created.confirmationRequired
          ? `Account '${created.email}' created. Email confirmation is required before first sign-in.`
          : `Account '${created.email}' created successfully.`,
        users: [...supabaseUsers, ...legacyUsers],
        confirmationRequired: created.confirmationRequired,
      });
    } catch (error: any) {
      return res.status(400).json({
        error: error?.message || "Unable to create Supabase Auth account.",
      });
    }
  }

  if (!password || password.length < 4) {
    return res.status(400).json({ error: "Legacy passwords must be at least 4 characters long." });
  }

  const db = await readDb();
  const newUsername = identity.toLowerCase();

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

  const legacyUsers = db.users.map(({ passwordHash, ...user }) => ({
    ...user,
    authProvider: "legacy",
  }));
  const supabaseUsers = await listSupabaseAppUsers();

  return res.json({
    success: true,
    message: `Legacy user '${newUsername}' added successfully.`,
    users: [...supabaseUsers, ...legacyUsers],
  });
});

// Revoke user access. Supabase identities are deactivated at the profile layer
// because Railway intentionally does not hold a Supabase service-role key.
app.post("/api/users/delete", authMiddleware, requireSuperAdmin, async (req: any, res: any) => {
  const identity =
    typeof req.body?.username === "string"
      ? req.body.username.trim()
      : "";

  if (!identity) {
    return res.status(400).json({ error: "Username or email is required." });
  }

  const supabaseUser = await findSupabaseAppUser(identity);

  if (supabaseUser) {
    if (
      req.user?.authProvider === "supabase" &&
      (req.user.id === supabaseUser.id || req.user.email?.toLowerCase() === String(supabaseUser.email).toLowerCase())
    ) {
      return res.status(400).json({ error: "You cannot revoke your own account." });
    }

    if (supabaseUser.role === "super-admin" && supabaseUser.is_active === true) {
      const db = await readDb();
      const legacySuperAdmins = (db.users ?? []).filter(user => user.role === "super-admin").length;
      const supabaseSuperAdmins = await countActiveSupabaseSuperAdmins();

      if (legacySuperAdmins + supabaseSuperAdmins <= 1) {
        return res.status(400).json({ error: "Cannot revoke the only remaining super-admin." });
      }
    }

    await revokeSupabaseAppUser(identity);

    const db = await readDb();
    const legacyUsers = (db.users ?? []).map(({ passwordHash, ...user }) => ({
      ...user,
      authProvider: "legacy",
    }));
    const supabaseUsers = await listSupabaseAppUsers();

    return res.json({
      success: true,
      message: `Access revoked for '${supabaseUser.email}'.`,
      users: [...supabaseUsers, ...legacyUsers],
    });
  }

  const db = await readDb();
  const targetUsername = identity.toLowerCase();
  const userToDelete = db.users?.find(user => user.username === targetUsername);

  if (!userToDelete) {
    return res.status(404).json({ error: "User not found." });
  }

  if (
    req.user?.authProvider !== "supabase" &&
    userToDelete.username === req.user?.username
  ) {
    return res.status(400).json({ error: "You cannot delete your own account." });
  }

  if (userToDelete.role === "super-admin") {
    const remainingLegacySuperAdmins = (db.users ?? []).filter(
      user => user.role === "super-admin" && user.username !== targetUsername
    ).length;
    const supabaseSuperAdmins = await countActiveSupabaseSuperAdmins();

    if (remainingLegacySuperAdmins + supabaseSuperAdmins <= 0) {
      return res.status(400).json({ error: "Cannot delete the only remaining super-admin." });
    }
  }

  db.users = db.users?.filter(user => user.username !== targetUsername);
  await writeDb(db);

  const legacyUsers = (db.users ?? []).map(({ passwordHash, ...user }) => ({
    ...user,
    authProvider: "legacy",
  }));
  const supabaseUsers = await listSupabaseAppUsers();

  return res.json({
    success: true,
    message: `User '${targetUsername}' revoked successfully.`,
    users: [...supabaseUsers, ...legacyUsers],
  });
});

// --- API Endpoints ---

// Get current configuration & state
app.get("/api/settings", authMiddleware, async (req: any, res: any) => {
  const db = await readDb();
  const isSuper = req.user?.role === "super-admin";
  
  const { passwordHash, users, ...safeDb } = db as any;
  const legacyUsers = users
    ? users.map(({ passwordHash, ...user }: any) => ({
        ...user,
        authProvider: "legacy",
      }))
    : [];
  const supabaseUsers = isSuper ? await listSupabaseAppUsers() : [];
  const safeUsers = [...supabaseUsers, ...legacyUsers];

  let destination = safeDb.destination;
  let posts = safeDb.posts;
  if (process.env.DATABASE_URL && req.user) {
    try {
      [destination, posts] = await Promise.all([
        getUserDestinationConfig(req.user),
        getUserInboxPosts(req.user),
      ]);
    } catch (error) {
      console.error("Failed loading user-scoped workspace data:", error);
      return res.status(500).json({
        error: "Your personal workspace data could not be loaded.",
      });
    }
  } else if (destination) {
    destination = {
      ...destination,
      botToken: "",
    };
  }

  res.json({
    ...safeDb,
    destination,
    posts,
    passwordSet:
      !!(users && users.length > 0) ||
      (await countActiveSupabaseAppUsers()) > 0,
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
  const usesUserScopedWorkspace = !!process.env.DATABASE_URL && !!req.user;

  // Sources, filters, and AI remain system-wide super-admin configuration.
  // Destinations and Content Inbox workflow state are personal to every authenticated user.
  if (!isSuper) {
    if (incoming.channels || incoming.filters || incoming.aiConfig) {
      return res.status(403).json({
        error: "Forbidden. Admins can edit posts and manage only their own Telegram destinations.",
      });
    }
  }

  if (incoming.channels && isSuper) db.channels = incoming.channels;
  if (incoming.filters && isSuper) db.filters = incoming.filters;
  if (incoming.aiConfig && isSuper) db.aiConfig = incoming.aiConfig;

  if (incoming.posts) {
    if (usesUserScopedWorkspace) {
      try {
        await saveUserInboxPosts(req.user, incoming.posts);
      } catch (error: any) {
        console.error("Failed saving user-scoped Content Inbox:", error);
        return res.status(400).json({
          error: error?.message || "Your Content Inbox changes could not be saved.",
        });
      }
    } else {
      // Local-development compatibility keeps the legacy global post state.
      db.posts = incoming.posts;
    }
  }

  let savedDestination: any = null;
  if (incoming.destination) {
    if (usesUserScopedWorkspace) {
      try {
        savedDestination = await saveUserDestinationTargets(
          req.user,
          incoming.destination.targets ?? []
        );
      } catch (error: any) {
        console.error("Failed saving user-scoped destinations:", error);
        return res.status(400).json({
          error: error?.message || "Your Telegram destinations could not be saved.",
        });
      }
    } else if (isSuper) {
      // Local-development compatibility when the normalized PostgreSQL backend
      // is not configured.
      db.destination = incoming.destination;
    } else {
      return res.status(403).json({
        error: "Personal destinations require the production database backend.",
      });
    }
  }

  await writeDb(db);

  const { passwordHash, users, ...safeDb } = db as any;
  const legacyUsers = users
    ? users.map(({ passwordHash, ...user }: any) => ({
        ...user,
        authProvider: "legacy",
      }))
    : [];
  const supabaseUsers = isSuper ? await listSupabaseAppUsers() : [];
  const safeUsers = [...supabaseUsers, ...legacyUsers];

  let destination = safeDb.destination;
  let posts = safeDb.posts;
  if (usesUserScopedWorkspace) {
    try {
      [destination, posts] = await Promise.all([
        savedDestination
          ? Promise.resolve(savedDestination)
          : getUserDestinationConfig(req.user),
        getUserInboxPosts(req.user),
      ]);
    } catch (error) {
      console.error("Failed reloading user-scoped workspace data:", error);
      return res.status(500).json({
        error: "Your personal workspace changes were saved but could not be reloaded.",
      });
    }
  } else if (destination) {
    destination = {
      ...destination,
      botToken: "",
    };
  }

  res.json({
    ...safeDb,
    destination,
    posts,
    passwordSet:
      !!(users && users.length > 0) ||
      (await countActiveSupabaseAppUsers()) > 0,
    supabaseActive: isSupabaseConfigured,
    geminiActive: !!process.env.GEMINI_API_KEY,
    openrouterActive: !!process.env.OPENROUTER_API_KEY,
    ...(isSuper ? { users: safeUsers } : {})
  });
});

// --- Supabase Database Management Endpoints ---

// Check table existence and configuration status
app.get("/api/supabase/status", authMiddleware, async (req, res) => {
  const [legacyStatus, health] = await Promise.all([
    checkTableExists(),
    getDatabaseHealth(),
  ]);

  res.json({
    configured: isSupabaseConfigured,
    hasDirectDbUrl: !!process.env.DATABASE_URL,
    supabaseUrl: process.env.SUPABASE_URL || "",
    legacyCompatibility: legacyStatus,
    ...health,
  });
});

// Setup/Bootstrap table on Supabase (using direct postgres connection) (super-admin only)
app.post("/api/supabase/setup-table", authMiddleware, requireSuperAdmin, async (req, res) => {
  const outcome = await autoCreateSettingsTable();
  res.json(outcome);
});

// Scrape target channels and parse posts
app.post("/api/fetch-posts", authOrCronMiddleware, async (req, res) => {
  const db = await readDb();
  const requestedUsernames = Array.isArray(req.body?.usernames)
    ? req.body.usernames
    : null;
  const usernamesToFetch = requestedUsernames ??
    db.channels.filter(channel => channel.enabled !== false).map(channel => channel.username);

  let newlyFetchedCount = 0;
  const currentPostsMap = new Map(db.posts.map(p => [p.id, p]));
  const dirtyPostsMap = new Map<string, CuratedPost>();

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

    await channelRepository.saveScanState({
      username: cleanUsername,
      display_name: db.channels[channelIdx].name,
      enabled: db.channels[channelIdx].enabled !== false,
      status: "fetching",
      error_message: null,
    });

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

      // readDb() intentionally returns only the newest 400 posts for the UI.
      // Before classifying scraped Telegram posts as new, hydrate any matching
      // persisted rows that fell outside that UI window. This preserves edits,
      // moderation state, and publish history while preventing false "new" counts.
      const scrapedPostIds = Array.from(new Set(
        messageBlocks
          .map(block => block.match(/data-post="([^"]+)"/)?.[1])
          .filter((postId): postId is string => !!postId)
      ));
      const missingPersistedIds = scrapedPostIds.filter(postId => !currentPostsMap.has(postId));

      if (missingPersistedIds.length > 0) {
        const persistedPosts = await postService.getPostsByIds(missingPersistedIds);
        for (const persisted of persistedPosts as any[]) {
          currentPostsMap.set(persisted.id, {
            id: persisted.id,
            channelUsername: persisted.channel_username,
            originalText: persisted.original_text,
            text: persisted.original_text,
            mediaType: persisted.media_type ?? undefined,
            photoUrl: persisted.photo_url ?? undefined,
            videoUrl: persisted.video_url ?? undefined,
            date: persisted.published_at,
            url: persisted.telegram_url,
            status:
              persisted.inbox_default_status === "archived"
                ? "archived"
                : "pending",
          });
        }
      }

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

        // The Content Inbox is a rolling 24-hour window. Ignore source posts
        // that are already expired instead of importing them and deleting them later.
        const sourcePublishedAt = Date.parse(date);
        if (
          Number.isFinite(sourcePublishedAt) &&
          sourcePublishedAt < Date.now() - 24 * 60 * 60 * 1000
        ) {
          continue;
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
          dirtyPostsMap.set(postId, newPost);
          newlyFetchedCount++;
        } else if (videoUrl) {
          // Existing video posts created before video support often stored the thumbnail
          // as photoUrl. Keep edits/status intact while attaching the authoritative video.
          let mediaChanged = false;
          if (existingPost.videoUrl !== videoUrl) {
            existingPost.videoUrl = videoUrl;
            mediaChanged = true;
          }
          if (existingPost.mediaType !== 'video') {
            existingPost.mediaType = 'video';
            mediaChanged = true;
          }
          if (!photoUrl && existingPost.photoUrl) {
            existingPost.photoUrl = undefined;
            mediaChanged = true;
          }
          if (mediaChanged) {
            dirtyPostsMap.set(postId, existingPost);
          }
        } else {
          let mediaChanged = false;
          const repairedPhotoUrl = repairLegacyPhotoUrl(existingPost.photoUrl, photoUrl);
          if (repairedPhotoUrl !== existingPost.photoUrl) {
            existingPost.photoUrl = repairedPhotoUrl;
            mediaChanged = true;
          }
          if (repairedPhotoUrl && existingPost.mediaType !== 'photo') {
            existingPost.mediaType = 'photo';
            mediaChanged = true;
          }
          if (mediaChanged) {
            dirtyPostsMap.set(postId, existingPost);
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

      await channelRepository.saveScanState({
        username: cleanUsername,
        display_name: db.channels[channelIdx].name,
        enabled: db.channels[channelIdx].enabled !== false,
        last_scan_at: db.channels[channelIdx].lastFetched,
        status: "success",
        error_message: null,
      });
    } catch (err: any) {
      console.error(`Error fetching channel @${username}:`, err);
      db.channels[channelIdx].status = "error";
      db.channels[channelIdx].lastFetched = new Date().toISOString();
      db.channels[channelIdx].errorMessage = err.message || "Failed to scrape channel";

      await channelRepository.saveScanState({
        username: cleanUsername,
        display_name: db.channels[channelIdx].name,
        enabled: db.channels[channelIdx].enabled !== false,
        last_scan_at: db.channels[channelIdx].lastFetched,
        status: "error",
        error_message: db.channels[channelIdx].errorMessage,
      });
    }
  }

  // Persist only posts that are genuinely new or whose authoritative media
  // metadata was repaired during this scan. PostgreSQL remains the durable source;
  // unchanged inbox rows should not receive a fresh updated_at every five minutes.
  try {
    const dirtyPosts = Array.from(dirtyPostsMap.values());
    const postEntities = dirtyPosts.map(post => ({
      id: post.id,
      channel_username: post.channelUsername,
      original_text: post.originalText,
      edited_text: post.originalText,
      media_type: post.mediaType ?? null,
      photo_url: post.photoUrl ?? null,
      video_url: post.videoUrl ?? null,
      telegram_url: post.url,
      published_at: post.date,
      posted_at: null,
      error_message: null,
      status: post.status === "archived" ? "archived" : "pending",
      inbox_default_status: post.status === "archived" ? "archived" : "pending",
    }));

    await postService.savePosts(postEntities);
    console.log(`Persisted ${postEntities.length} changed inbox posts.`);
  } catch (err) {
    console.error("Failed saving changed inbox posts:", err);
  }

const isCronActor = req.user?.username === "system:cron";
const latestPosts =
  process.env.DATABASE_URL && req.user && !isCronActor
    ? await getUserInboxPosts(req.user, 400)
    : (await postService.getRecentPosts(400)).map((p: any) => ({
        id: p.id,
        channelUsername: p.channel_username,
        originalText: p.original_text,
        text: p.original_text,
        mediaType: p.media_type,
        photoUrl: p.photo_url,
        videoUrl: p.video_url,
        date: p.published_at,
        url: p.telegram_url,
        status: p.inbox_default_status === "archived" ? "archived" : "pending",
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

// Post curated text directly to target Telegram channels via the shared publisher service.
app.post("/api/post-telegram", authMiddleware, async (req: any, res) => {
  const { postId, text, targetIds } = req.body;
  const db = await readDb();
  const usesUserScopedWorkspace = !!process.env.DATABASE_URL && !!req.user;

  let destination = db.destination;
  if (usesUserScopedWorkspace) {
    try {
      destination = await getUserDestinationConfig(req.user);
    } catch (error) {
      console.error("Failed resolving user-scoped destinations:", error);
      return res.status(500).json({
        error: "Your Telegram destinations could not be loaded.",
      });
    }
  }

  const { targets, channelId } = destination;

  let botToken = "";
  try {
    if (usesUserScopedWorkspace) {
      const ownerPrincipal = destinationOwnerPrincipalForUser(req.user);
      botToken = await getUserTelegramBotToken(ownerPrincipal);
    } else {
      botToken = await getMainTelegramBotToken();
    }
  } catch {
    if (process.env.DATABASE_URL) {
      console.error("Failed resolving Telegram bot credential.");
      return res.status(500).json({ error: "Telegram bot credential could not be loaded." });
    }
  }

  // Local development and integration tests intentionally run without DATABASE_URL.
  if (!botToken && !process.env.DATABASE_URL) {
    botToken = typeof destination.botToken === "string"
      ? destination.botToken.trim()
      : "";
  }

  if (!botToken) {
    return res.status(400).json({ error: "Telegram bot token is not configured for your account." });
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

  const usesUserScopedInbox = !!process.env.DATABASE_URL && !!req.user;
  let postIdx = -1;
  let post: CuratedPost | null = null;

  if (usesUserScopedInbox) {
    post = await getUserInboxPost(req.user, String(postId ?? ""));
  } else {
    postIdx = db.posts.findIndex(p => p.id === postId);
    post = postIdx >= 0 ? db.posts[postIdx] : null;
  }

  if (!post) {
    return res.status(404).json({ error: "Post not found in your Content Inbox." });
  }

  const formattedText =
    typeof text === "string" && text.length > 0
      ? text
      : post.text;

  const publishResult = await telegramPublisherService.publish({
    botToken,
    targets: activeTargets,
    post: {
      url: post.url,
      photoUrl: post.photoUrl,
      videoUrl: post.videoUrl
    },
    text: formattedText
  });

  let responseDestination = destination;

  if (usesUserScopedWorkspace) {
    try {
      responseDestination = await updateUserDestinationStatuses(
        req.user,
        publishResult.results.map(result => ({
          targetId: result.targetId,
          success: result.success,
          error: result.error,
        }))
      );
    } catch (error) {
      // Telegram delivery already happened. Do not turn a successful send into a
      // failed HTTP response only because readiness metadata could not be saved.
      console.error("Failed persisting user destination status:", error);
    }
  } else {
    // Local-development compatibility for the legacy global destination model.
    for (const result of publishResult.results) {
      const dbTargetIdx = db.destination.targets?.findIndex(target => target.id === result.targetId);
      if (dbTargetIdx === undefined || dbTargetIdx === -1) continue;

      if (result.success) {
        db.destination.targets[dbTargetIdx].status = "success";
        db.destination.targets[dbTargetIdx].errorMessage = undefined;
      } else {
        db.destination.targets[dbTargetIdx].status = "error";
        db.destination.targets[dbTargetIdx].errorMessage = result.error;
      }
    }
  }

  const failures = publishResult.results.filter(result => !result.success);
  let responsePost: CuratedPost = { ...post };

  if (publishResult.success) {
    responsePost = {
      ...post,
      status: "posted",
      text: formattedText,
      postedAt: new Date().toISOString(),
      errorMessage:
        failures.length > 0
          ? `Published to some targets. Failures: ${failures.map(failure => `${failure.name}: ${failure.error}`).join("; ")}`
          : undefined,
    };
  } else {
    responsePost = {
      ...post,
      errorMessage: `Failed to publish to all selected targets. Errors: ${publishResult.results.map(result => `${result.name}: ${result.error}`).join("; ")}`,
    };
  }

  if (usesUserScopedInbox) {
    try {
      await saveUserInboxPosts(req.user, [responsePost]);
      responsePost =
        (await getUserInboxPost(req.user, responsePost.id)) ?? responsePost;
    } catch (error) {
      console.error("Failed persisting user Content Inbox publishing state:", error);
      return res.status(500).json({
        error: "Telegram delivery completed, but your Content Inbox state could not be saved.",
        outcome: publishResult.outcome,
        results: publishResult.results,
      });
    }
  } else {
    db.posts[postIdx] = responsePost;
  }

  if (!usesUserScopedWorkspace) {
    db.destination.connected = publishResult.success || db.destination.connected;
    responseDestination = db.destination;
  }

  if (!usesUserScopedInbox) {
    await writeDb(db);
  }

  return res.json({
    success: publishResult.success,
    outcome: publishResult.outcome,
    summary: publishResult.summary,
    post: responsePost,
    results: publishResult.results,
    destination: {
      ...responseDestination,
      botToken: "",
      botTokenConfigured: true,
    }
  });
});

app.post("/api/destination/bot-token", authMiddleware, async (req: any, res) => {
  try {
    if (process.env.DATABASE_URL && req.user) {
      const ownerPrincipal = destinationOwnerPrincipalForUser(req.user);
      await saveUserTelegramBotToken(ownerPrincipal, req.body?.botToken);
    } else {
      if (req.user?.role !== "super-admin") {
        return res.status(403).json({
          success: false,
          configured: false,
          error: "Personal destination credentials require the production database backend.",
        });
      }
      await saveMainTelegramBotToken(req.body?.botToken);
    }

    return res.json({
      success: true,
      configured: true,
      message: "Telegram bot token stored securely for your account.",
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      configured: false,
      error: error?.message || "Telegram bot token could not be stored.",
    });
  }
});

// Test bot connectivity in stages so configuration errors are easy to diagnose.
app.post("/api/test-bot", authMiddleware, async (req: any, res) => {
  const requestedTargetId =
    typeof req.body?.targetId === "string" ? req.body.targetId.trim() : "";
  let channelId =
    typeof req.body?.channelId === "string" ? req.body.channelId.trim() : "";

  if (!requestedTargetId && !channelId) {
    return res.status(400).json({
      success: false,
      stage: "input",
      error: "Destination target ID or channel ID is required."
    });
  }

  let botToken = "";
  try {
    if (process.env.DATABASE_URL && req.user) {
      const userDestination = await getUserDestinationConfig(req.user);
      const ownedTarget = requestedTargetId
        ? userDestination.targets.find(target => target.id === requestedTargetId)
        : userDestination.targets.find(target => target.channelId.trim() === channelId);

      if (!ownedTarget) {
        return res.status(404).json({
          success: false,
          stage: "target",
          error: "This destination does not belong to your account."
        });
      }

      // Resolve the Telegram chat identifier from backend-owned destination data.
      // Ignore any conflicting browser-supplied channelId when targetId is present.
      channelId = ownedTarget.channelId.trim();

      const ownerPrincipal = destinationOwnerPrincipalForUser(req.user);
      botToken = await getUserTelegramBotToken(ownerPrincipal);
    } else {
      botToken = await getMainTelegramBotToken();
    }
  } catch {
    if (process.env.DATABASE_URL) {
      return res.status(500).json({
        success: false,
        stage: "credential",
        error: "Your Telegram bot credential could not be loaded."
      });
    }
  }

  if (!botToken && !process.env.DATABASE_URL) {
    const localDb = await readDb();
    botToken = typeof localDb.destination.botToken === "string"
      ? localDb.destination.botToken.trim()
      : "";
  }

  if (!botToken) {
    return res.status(400).json({
      success: false,
      stage: "credential",
      error: "Save your Telegram bot token before testing a destination."
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
