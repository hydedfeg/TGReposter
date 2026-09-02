import { getPostgresPool } from "../utils/postgresPool";

export type AppRole = "super-admin" | "admin";

export interface AuthenticatedAppUser {
  id: string;
  email: string;
  username: string;
  role: AppRole;
  authProvider: "supabase";
}

interface SupabaseAuthUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

interface SupabaseTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: SupabaseAuthUser;
  error?: string;
  error_description?: string;
  msg?: string;
}

function supabaseAuthConfig() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY?.trim();

  if (!url || !key) {
    throw new Error("Supabase Auth is not configured.");
  }

  return { url, key };
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs = 10_000
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function getSupabaseProfileByUserId(userId: string) {
  const { rows } = await getPostgresPool().query(
    `
      select id, email, full_name, role, is_active, created_at, updated_at
      from public.profiles
      where id = $1::uuid
      limit 1
    `,
    [userId]
  );

  return rows[0] ?? null;
}

export async function validateSupabaseAccessToken(
  token: string
): Promise<AuthenticatedAppUser | null> {
  const cleanToken = token.trim();
  if (!cleanToken || !process.env.DATABASE_URL || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return null;
  }

  const { url, key } = supabaseAuthConfig();

  const response = await fetchWithTimeout(
    `${url}/auth/v1/user`,
    {
      method: "GET",
      headers: {
        apikey: key,
        Authorization: `Bearer ${cleanToken}`,
      },
    }
  );

  if (response.status === 401 || response.status === 403) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Supabase Auth validation failed with HTTP ${response.status}.`);
  }

  const user = (await response.json()) as SupabaseAuthUser;
  if (!user?.id) return null;

  const profile = await getSupabaseProfileByUserId(user.id);
  if (!profile || profile.is_active !== true) {
    return null;
  }

  const role = profile.role === "super-admin" ? "super-admin" : "admin";
  const email = String(profile.email || user.email || "").trim();
  const username =
    String(profile.full_name || "").trim() ||
    email ||
    user.id;

  return {
    id: user.id,
    email,
    username,
    role,
    authProvider: "supabase",
  };
}

export async function signInWithSupabasePassword(
  email: string,
  password: string
): Promise<{
  token: string;
  refreshToken?: string;
  expiresIn?: number;
  user: AuthenticatedAppUser;
} | null> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !password) return null;

  const { url, key } = supabaseAuthConfig();

  const response = await fetchWithTimeout(
    `${url}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: cleanEmail,
        password,
      }),
    }
  );

  const body = (await response.json().catch(() => ({}))) as SupabaseTokenResponse;

  if (response.status === 400 || response.status === 401) {
    return null;
  }

  if (!response.ok || !body.access_token) {
    const description =
      body.error_description || body.msg || body.error || "Supabase Auth sign-in failed.";
    throw new Error(description);
  }

  const user = await validateSupabaseAccessToken(body.access_token);
  if (!user) {
    throw new Error("This account is not active for TGReposter.");
  }

  return {
    token: body.access_token,
    ...(body.refresh_token ? { refreshToken: body.refresh_token } : {}),
    ...(typeof body.expires_in === "number" ? { expiresIn: body.expires_in } : {}),
    user,
  };
}

export async function listSupabaseAppUsers() {
  if (!process.env.DATABASE_URL) return [];

  const { rows } = await getPostgresPool().query(
    `
      select id, email, full_name, role, is_active, created_at
      from public.profiles
      order by created_at asc nulls last, email asc
    `
  );

  return rows.map(row => ({
    id: row.id,
    username: String(row.full_name || row.email || row.id),
    email: row.email,
    role: row.role === "super-admin" ? "super-admin" : "admin",
    isActive: row.is_active === true,
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at ?? ""),
    authProvider: "supabase" as const,
  }));
}

export async function countActiveSupabaseAppUsers() {
  if (!process.env.DATABASE_URL) return 0;

  const { rows } = await getPostgresPool().query(
    `
      select count(*)::bigint as count
      from public.profiles
      where is_active = true
    `
  );

  return Number(rows[0]?.count ?? 0);
}


export async function createSupabaseAppUser(input: {
  email: string;
  password: string;
  role: AppRole;
  fullName?: string;
}) {
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const fullName = input.fullName?.trim() || email.split("@")[0];

  if (!email.includes("@")) {
    throw new Error("A valid email address is required for Supabase Auth accounts.");
  }

  if (password.length < 8) {
    throw new Error("Supabase Auth passwords must be at least 8 characters.");
  }

  if (input.role !== "admin" && input.role !== "super-admin") {
    throw new Error("Invalid application role.");
  }

  const pool = getPostgresPool();
  const existing = await pool.query(
    `
      select id
      from public.profiles
      where lower(email) = lower($1)
      limit 1
    `,
    [email]
  );

  if (existing.rows.length > 0) {
    throw new Error("An account with this email already exists.");
  }

  const { url, key } = supabaseAuthConfig();
  const response = await fetchWithTimeout(
    `${url}/auth/v1/signup`,
    {
      method: "POST",
      headers: {
        apikey: key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        data: {
          full_name: fullName,
        },
      }),
    }
  );

  const body = (await response.json().catch(() => ({}))) as SupabaseTokenResponse & {
    id?: string;
  };

  if (!response.ok) {
    const description =
      body.error_description || body.msg || body.error || "Supabase Auth signup failed.";
    throw new Error(description);
  }

  const userId = body.user?.id || body.id;
  if (!userId) {
    throw new Error("Supabase Auth did not return a user identifier.");
  }

  const activated = await pool.query(
    `
      update public.profiles
      set full_name = $2,
          role = $3,
          is_active = true,
          updated_at = now()
      where id = $1::uuid
      returning id, email, full_name, role, is_active, created_at
    `,
    [userId, fullName, input.role]
  );

  if (activated.rows.length === 0) {
    throw new Error("Supabase profile bootstrap did not complete.");
  }

  const profile = activated.rows[0];

  return {
    id: profile.id,
    username: String(profile.full_name || profile.email),
    email: profile.email,
    role: profile.role === "super-admin" ? "super-admin" : "admin",
    isActive: profile.is_active === true,
    createdAt:
      profile.created_at instanceof Date
        ? profile.created_at.toISOString()
        : String(profile.created_at ?? ""),
    authProvider: "supabase" as const,
    confirmationRequired: !body.access_token,
  };
}

export async function revokeSupabaseAppUser(identity: string) {
  const cleanIdentity = identity.trim();
  if (!cleanIdentity || !process.env.DATABASE_URL) return null;

  const pool = getPostgresPool();
  const result = await pool.query(
    `
      update public.profiles
      set is_active = false,
          updated_at = now()
      where id::text = $1
         or lower(email) = lower($1)
      returning id, email, full_name, role, is_active, created_at
    `,
    [cleanIdentity]
  );

  return result.rows[0] ?? null;
}

export async function countActiveSupabaseSuperAdmins() {
  if (!process.env.DATABASE_URL) return 0;

  const { rows } = await getPostgresPool().query(
    `
      select count(*)::bigint as count
      from public.profiles
      where is_active = true
        and role = 'super-admin'
    `
  );

  return Number(rows[0]?.count ?? 0);
}

export async function findSupabaseAppUser(identity: string) {
  const cleanIdentity = identity.trim();
  if (!cleanIdentity || !process.env.DATABASE_URL) return null;

  const { rows } = await getPostgresPool().query(
    `
      select id, email, full_name, role, is_active, created_at
      from public.profiles
      where id::text = $1
         or lower(email) = lower($1)
      limit 1
    `,
    [cleanIdentity]
  );

  return rows[0] ?? null;
}
