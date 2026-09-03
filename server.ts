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
import { ensureInboxPostsForOwner, getInboxPostsForOwner, getUserInboxPost, getUserInboxPosts, saveUserInboxPosts } from "./server/services/userInboxService";
import { getUserWorkspaceConfig, saveUserAIConfig, saveUserChannels, saveUserFilters, userWorkspaceRepository } from "./server/services/userWorkspaceService";
import { ownerPrincipalForUser } from "./server/services/userPrincipalService";
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
  const user = db.users?.find(
    u => u.username === checkUser && u.isActive !== false
  );

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
    return res.status(400).json({ error: "Email address is required." });
  }

  if (role !== "super-admin" && role !== "admin") {
    return res.status(400).json({ error: "Invalid role. Must be 'super-admin' or 'admin'." });
  }

  // Production members must use Supabase Auth so personal Content Inbox and
  // Destinations ownership is anchored to an immutable auth user ID.
  if (process.env.DATABASE_URL && !identity.includes("@")) {
    return res.status(400).json({
      error: "New production workspace members require an email-based Supabase Auth account.",
    });
  }

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

  // Legacy username creation is retained only for local-development compatibility
  // when the normalized production database is not configured.
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
      const legacySuperAdmins = (db.users ?? []).filter(
        user => user.role === "super-admin" && user.isActive !== false
      ).length;
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
      message: `Access revoked for '${supabaseUser.email}'. Personal workspace data was retained.`,
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

  if (userToDelete.role === "super-admin" && userToDelete.isActive !== false) {
    const remainingLegacySuperAdmins = (db.users ?? []).filter(
      user =>
        user.role === "super-admin" &&
        user.username !== targetUsername &&
        user.isActive !== false
    ).length;
    const supabaseSuperAdmins = await countActiveSupabaseSuperAdmins();

    if (remainingLegacySuperAdmins + supabaseSuperAdmins <= 0) {
      return res.status(400).json({ error: "Cannot revoke the only remaining super-admin." });
    }
  }

  // Keep the identity record so the personal Inbox/Destinations ownership key
  // remains attributable for audit/recovery. Authentication ignores revoked users.
  userToDelete.isActive = false;
  await writeDb(db);

  const legacyUsers = (db.users ?? []).map(({ passwordHash, ...user }) => ({
    ...user,
    authProvider: "legacy",
  }));
  const supabaseUsers = await listSupabaseAppUsers();

  return res.json({
    success: true,
    message: `Access revoked for '${targetUsername}'. Personal workspace data was retained.`,
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

  let channels = safeDb.channels;
  let filters = safeDb.filters;
  let aiConfig = safeDb.aiConfig;
  let destination = safeDb.destination;
  let posts = safeDb.posts;

  if (process.env.DATABASE_URL && req.user) {
    try {
      const [workspace, userDestination, userPosts] = await Promise.all([
        getUserWorkspaceConfig(req.user),
        getUserDestinationConfig(req.user),
        getUserInboxPosts(req.user),
      ]);

      channels = workspace.channels;
      filters = workspace.filters;
      aiConfig = workspace.aiConfig;
      destination = userDestination;
      posts = userPosts;
    } catch (error) {
      console.error("Failed loading user-owned workspace data:", error);
      return res.status(500).json({
        error: "Your workspace data could not be loaded.",
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
    channels,
    filters,
    aiConfig,
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

  let savedDestination: any = null;

  if (usesUserScopedWorkspace) {
    try {
      const saves: Promise<unknown>[] = [];

      if (incoming.channels) {
        saves.push(saveUserChannels(req.user, incoming.channels));
      }
      if (incoming.filters) {
        saves.push(saveUserFilters(req.user, incoming.filters));
      }
      if (incoming.aiConfig) {
        saves.push(saveUserAIConfig(req.user, incoming.aiConfig));
      }
      if (incoming.posts) {
        saves.push(saveUserInboxPosts(req.user, incoming.posts));
      }
      if (incoming.destination) {
        savedDestination = await saveUserDestinationTargets(
          req.user,
          incoming.destination.targets ?? []
        );
      }

      await Promise.all(saves);
    } catch (error: any) {
      console.error("Failed saving user-owned workspace data:", error);
      return res.status(400).json({
        error: error?.message || "Your workspace changes could not be saved.",
      });
    }
  } else {
    // Local-development compatibility keeps the previous single-user state model.
    if (incoming.channels) db.channels = incoming.channels;
    if (incoming.filters) db.filters = incoming.filters;
    if (incoming.aiConfig) db.aiConfig = incoming.aiConfig;
    if (incoming.posts) db.posts = incoming.posts;
    if (incoming.destination) db.destination = incoming.destination;
    await writeDb(db);
  }

  const { passwordHash, users, ...safeDb } = db as any;
  const legacyUsers = users
    ? users.map(({ passwordHash, ...user }: any) => ({
        ...user,
        authProvider: "legacy",
      }))
    : [];
  const supabaseUsers = isSuper ? await listSupabaseAppUsers() : [];
  const safeUsers = [...supabaseUsers, ...legacyUsers];

  let channels = safeDb.channels;
  let filters = safeDb.filters;
  let aiConfig = safeDb.aiConfig;
  let destination = safeDb.destination;
  let posts = safeDb.posts;

  if (usesUserScopedWorkspace) {
    try {
      const [workspace, userDestination, userPosts] = await Promise.all([
        getUserWorkspaceConfig(req.user),
        savedDestination
          ? Promise.resolve(savedDestination)
          : getUserDestinationConfig(req.user),
        getUserInboxPosts(req.user),
      ]);
      channels = workspace.channels;
      filters = workspace.filters;
      aiConfig = workspace.aiConfig;
      destination = userDestination;
      posts = userPosts;
    } catch (error) {
      console.error("Failed reloading user-owned workspace data:", error);
      return res.status(500).json({
        error: "Your workspace changes were saved but could not be reloaded.",
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
    channels,
    filters,
    aiConfig,
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
app.get("/api/supabase/status", authMiddleware, requireSuperAdmin, async (req, res) => {
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

// Scrape only the signed-in user's source subscriptions. The scheduled collector
// iterates each owner independently. public.posts is only an internal ingestion
// cache; user-visible rows are explicitly assigned to user_inbox_items.
function matchesWorkspaceFilters(originalText: string, filters: FilterConfig) {
  const textToMatch = filters.caseSensitive
    ? originalText
    : originalText.toLowerCase();

  for (const keyword of filters.negativeKeywords ?? []) {
    const clean = filters.caseSensitive ? keyword : keyword.toLowerCase();
    if (clean && textToMatch.includes(clean)) return false;
  }

  const positives = filters.positiveKeywords ?? [];
  const hashtags = filters.requiredHashtags ?? [];
  if (positives.length === 0 && hashtags.length === 0) return true;

  for (const keyword of positives) {
    const clean = filters.caseSensitive ? keyword : keyword.toLowerCase();
    if (clean && textToMatch.includes(clean)) return true;
  }

  for (const hashtag of hashtags) {
    const clean = filters.caseSensitive ? hashtag : hashtag.toLowerCase();
    const token = clean.startsWith("#") ? clean : `#${clean}`;
    if (token && textToMatch.includes(token)) return true;
  }

  return false;
}

async function scrapeOwnedWorkspace(
  ownerPrincipal: string,
  workspace: {
    channels: SourceChannel[];
    filters: FilterConfig;
  },
  requestedUsernames?: string[] | null
) {
  const requested = requestedUsernames
    ? new Set(
        requestedUsernames
          .map(value => String(value).trim().replace(/^@/, "").toLowerCase())
          .filter(Boolean)
      )
    : null;

  const configuredUsernames = new Set(
    workspace.channels.map(channel => channel.username.toLowerCase())
  );

  if (requested) {
    const unauthorized = Array.from(requested).filter(
      username => !configuredUsernames.has(username)
    );
    if (unauthorized.length > 0) {
      const error: any = new Error(
        `Source channel does not belong to this workspace: @${unauthorized[0]}`
      );
      error.status = 403;
      throw error;
    }
  }

  const channels = workspace.channels.map(channel => ({ ...channel }));
  const selectedChannels = channels.filter(channel => {
    if (channel.enabled === false) return false;
    return requested ? requested.has(channel.username.toLowerCase()) : true;
  });

  let newlyAssignedCount = 0;
  const existingInbox = await getInboxPostsForOwner(ownerPrincipal, 1000);
  const existingInboxIds = new Set(existingInbox.map((post: any) => post.id));
  const canonicalChanges = new Map<string, CuratedPost>();
  const observedForInbox = new Map<string, CuratedPost>();

  for (const channel of selectedChannels) {
    const cleanUsername = channel.username.trim().replace(/^@/, "").toLowerCase();
    const channelIndex = channels.findIndex(
      candidate => candidate.username.toLowerCase() === cleanUsername
    );
    if (channelIndex < 0) continue;

    channels[channelIndex].status = "fetching";
    channels[channelIndex].errorMessage = undefined;

    await userWorkspaceRepository.saveScanState(ownerPrincipal, {
      ...channels[channelIndex],
      username: cleanUsername,
      status: "fetching",
      errorMessage: undefined,
    });

    try {
      const response = await fetch(`https://t.me/s/${cleanUsername}`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      if (!response.ok) {
        throw new Error(`Telegram returned status ${response.status}`);
      }

      const html = await response.text();
      const messageBlocks = html.split('class="tgme_widget_message_wrap');
      messageBlocks.shift();

      const scrapedPostIds = Array.from(
        new Set(
          messageBlocks
            .map(block => block.match(/data-post="([^"]+)"/)?.[1])
            .filter((postId): postId is string => !!postId)
        )
      );
      const persistedPosts = await postService.getPostsByIds(scrapedPostIds);
      const persistedById = new Map(
        (persistedPosts as any[]).map(post => [String(post.id), post])
      );

      for (const block of messageBlocks) {
        const postMatch = block.match(/data-post="([^"]+)"/);
        if (!postMatch) continue;
        const postId = postMatch[1];

        let originalText = "";
        const textMatch =
          block.match(
            /<div class="tgme_widget_message_text[^"]*"[^>]* dir="auto">([\s\S]*?)<\/div>/
          ) ||
          block.match(
            /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/
          );
        if (textMatch) {
          originalText = textMatch[1]
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(
              /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
              "$2 ($1)"
            )
            .replace(/<[^>]+>/g, "")
            .trim();
        }

        const videoUrl = extractTelegramVideoUrl(block);
        const photoUrl = extractTelegramPhotoUrl(block);
        const mediaType: CuratedPost["mediaType"] = videoUrl
          ? "video"
          : photoUrl
            ? "photo"
            : undefined;

        if (!originalText && !photoUrl && !videoUrl) continue;

        let date = new Date().toISOString();
        const dateMatch = block.match(/<time datetime="([^"]+)"/);
        if (dateMatch) date = dateMatch[1];

        const sourcePublishedAt = Date.parse(date);
        if (
          Number.isFinite(sourcePublishedAt) &&
          sourcePublishedAt < Date.now() - 24 * 60 * 60 * 1000
        ) {
          continue;
        }

        const existing = persistedById.get(postId);
        const canonical: CuratedPost = existing
          ? {
              id: postId,
              channelUsername: existing.channel_username,
              originalText: existing.original_text,
              text: existing.original_text,
              mediaType: existing.media_type ?? undefined,
              photoUrl: existing.photo_url ?? undefined,
              videoUrl: existing.video_url ?? undefined,
              date: existing.published_at
                ? new Date(existing.published_at).toISOString()
                : date,
              url: existing.telegram_url || `https://t.me/${postId}`,
              status: "pending",
            }
          : {
              id: postId,
              channelUsername: cleanUsername,
              originalText,
              text: originalText,
              mediaType,
              photoUrl,
              videoUrl,
              date,
              url: `https://t.me/${postId}`,
              status: "pending",
            };

        let canonicalChanged = !existing;

        if (videoUrl) {
          if (canonical.videoUrl !== videoUrl) {
            canonical.videoUrl = videoUrl;
            canonicalChanged = true;
          }
          if (canonical.mediaType !== "video") {
            canonical.mediaType = "video";
            canonicalChanged = true;
          }
          if (!photoUrl && canonical.photoUrl) {
            canonical.photoUrl = undefined;
            canonicalChanged = true;
          }
        } else {
          const repairedPhotoUrl = repairLegacyPhotoUrl(
            canonical.photoUrl,
            photoUrl
          );
          if (repairedPhotoUrl !== canonical.photoUrl) {
            canonical.photoUrl = repairedPhotoUrl;
            canonicalChanged = true;
          }
          if (repairedPhotoUrl && canonical.mediaType !== "photo") {
            canonical.mediaType = "photo";
            canonicalChanged = true;
          }
        }

        if (canonicalChanged) {
          canonicalChanges.set(postId, canonical);
        }

        const personalStatus = matchesWorkspaceFilters(
          canonical.originalText,
          workspace.filters
        )
          ? "pending"
          : "archived";

        observedForInbox.set(postId, {
          ...canonical,
          text: canonical.originalText,
          status: personalStatus,
        });

        if (!existingInboxIds.has(postId)) {
          newlyAssignedCount += 1;
          existingInboxIds.add(postId);
        }
      }

      channels[channelIndex].status = "success";
      channels[channelIndex].lastFetched = new Date().toISOString();
      channels[channelIndex].errorMessage = undefined;

      const titleMatch = html.match(
        /<meta property="og:title" content="([^"]+)"/
      );
      if (
        titleMatch &&
        (!channels[channelIndex].name ||
          channels[channelIndex].name === channels[channelIndex].username)
      ) {
        channels[channelIndex].name = titleMatch[1];
      }

      await userWorkspaceRepository.saveScanState(
        ownerPrincipal,
        channels[channelIndex]
      );
    } catch (error: any) {
      console.error(
        `Error fetching user-owned channel @${cleanUsername}:`,
        error
      );
      channels[channelIndex].status = "error";
      channels[channelIndex].lastFetched = new Date().toISOString();
      channels[channelIndex].errorMessage =
        error?.message || "Failed to scrape channel";

      await userWorkspaceRepository.saveScanState(
        ownerPrincipal,
        channels[channelIndex]
      );
    }
  }

  const canonicalEntities = Array.from(canonicalChanges.values()).map(post => ({
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
    status: "pending",
    inbox_default_status: "pending" as const,
  }));

  if (canonicalEntities.length > 0) {
    await postService.savePosts(canonicalEntities);
  }

  await ensureInboxPostsForOwner(
    ownerPrincipal,
    Array.from(observedForInbox.values())
  );

  return {
    channels: (await userWorkspaceRepository.getConfig(ownerPrincipal)).channels,
    posts: await getInboxPostsForOwner(ownerPrincipal, 400),
    fetchedCount: newlyAssignedCount,
  };
}

app.post("/api/fetch-posts", authOrCronMiddleware, async (req: any, res) => {
  const isCronActor = req.user?.username === "system:cron";

  try {
    if (process.env.DATABASE_URL) {
      if (isCronActor) {
        const workspaces = await userWorkspaceRepository.listAllConfigs();
        let fetchedCount = 0;

        for (const workspace of workspaces) {
          if (!workspace.channels.some(channel => channel.enabled !== false)) {
            continue;
          }
          const result = await scrapeOwnedWorkspace(
            workspace.ownerPrincipal,
            workspace,
            null
          );
          fetchedCount += result.fetchedCount;
        }

        return res.json({
          success: true,
          workspaceCount: workspaces.length,
          fetchedCount,
        });
      }

      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized. Please log in." });
      }

      const workspace = await getUserWorkspaceConfig(req.user);
      const ownerPrincipal = ownerPrincipalForUser(req.user);
      const requestedUsernames = Array.isArray(req.body?.usernames)
        ? req.body.usernames
        : null;

      return res.json(
        await scrapeOwnedWorkspace(
          ownerPrincipal,
          workspace,
          requestedUsernames
        )
      );
    }

    // Local single-user compatibility when DATABASE_URL is not configured.
    const db = await readDb();
    return res.json({
      channels: db.channels,
      posts: db.posts,
      fetchedCount: 0,
      warning: "Persistent per-user collection requires DATABASE_URL.",
    });
  } catch (error: any) {
    console.error("Workspace source synchronization failed:", error);
    return res.status(error?.status || 500).json({
      error: error?.message || "Source synchronization failed.",
    });
  }
});

// Trigger AI Content Curation (Gemini or OpenRouter)
app.post("/api/ai/curate", authMiddleware, async (req: any, res) => {
  const db = await readDb();
  let aiProvider = db.aiConfig?.provider || "gemini";
  let aiModel = db.aiConfig?.model || "gemini-3.5-flash";

  if (process.env.DATABASE_URL && req.user) {
    try {
      const workspace = await getUserWorkspaceConfig(req.user);
      aiProvider = workspace.aiConfig.provider;
      aiModel = workspace.aiConfig.model;
    } catch (error) {
      console.error("Failed loading user AI configuration:", error);
      return res.status(500).json({ error: "Your AI configuration could not be loaded." });
    }
  }

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
