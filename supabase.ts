import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import runtimeSettingsRepository from "./server/repositories/settingsRepository";
import { getPostgresConnectionString } from "./server/utils/postgresConnection";

dotenv.config();

let rawSupabaseUrl = process.env.SUPABASE_URL;
if (
  rawSupabaseUrl &&
  !rawSupabaseUrl.startsWith("http://") &&
  !rawSupabaseUrl.startsWith("https://")
) {
  if (!rawSupabaseUrl.includes(".")) {
    rawSupabaseUrl = `https://${rawSupabaseUrl}.supabase.co`;
  } else {
    rawSupabaseUrl = `https://${rawSupabaseUrl}`;
  }
}

export const supabaseUrl = rawSupabaseUrl;
export const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

const isSupabaseClientConfigured = !!(supabaseUrl && supabaseAnonKey);
export const isSupabaseConfigured =
  !!process.env.DATABASE_URL || isSupabaseClientConfigured;

console.log("Supabase configured:", isSupabaseConfigured);
console.log("Supabase URL:", supabaseUrl);

let supabase: any = null;

export function getSupabaseClient() {
  if (!isSupabaseClientConfigured) return null;
  if (!supabase) {
    supabase = createClient(supabaseUrl!, supabaseAnonKey!);
  }
  return supabase;
}

async function readLegacySettingsViaRest(): Promise<any | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("curator_settings")
    .select("data")
    .eq("id", "default")
    .single();

  if (error) {
    console.warn("Supabase legacy settings read failed:", error.message);
    return null;
  }

  return data?.data ?? null;
}

async function writeLegacySettingsViaRest(settings: any): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  const { error } = await client
    .from("curator_settings")
    .upsert({
      id: "default",
      data: settings,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.error("Supabase legacy settings write failed:", error.message);
    return false;
  }

  return true;
}

export async function checkTableExists(): Promise<{
  exists: boolean;
  error?: string;
  methodUsed: string;
}> {
  if (process.env.DATABASE_URL) {
    try {
      const { Client } = await import("pg");
      const client = new Client({
        connectionString: getPostgresConnectionString(),
      });
      await client.connect();
      const result = await client.query(`
        select exists (
          select 1
          from information_schema.tables
          where table_schema = 'public'
            and table_name = 'curator_settings'
        ) as exists
      `);
      await client.end();
      return {
        exists: !!result.rows[0]?.exists,
        methodUsed: "Backend PostgreSQL",
      };
    } catch (error: any) {
      console.warn(
        "Backend PostgreSQL table check failed, trying REST API:",
        error?.message
      );
    }
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      exists: false,
      error:
        "Supabase database access is not configured. Set DATABASE_URL for the backend.",
      methodUsed: "Unavailable",
    };
  }

  try {
    const { error } = await client
      .from("curator_settings")
      .select("id")
      .limit(1);

    if (error) {
      if (
        error.code === "42P01" ||
        error.message?.includes("does not exist") ||
        error.message?.includes("relation")
      ) {
        return {
          exists: false,
          error: "Table 'curator_settings' does not exist.",
          methodUsed: "REST API",
        };
      }

      return {
        exists: false,
        error: error.message,
        methodUsed: "REST API",
      };
    }

    return { exists: true, methodUsed: "REST API" };
  } catch (error: any) {
    return {
      exists: false,
      error: error?.message,
      methodUsed: "REST API",
    };
  }
}

export async function autoCreateSettingsTable(): Promise<{
  success: boolean;
  message: string;
}> {
  if (!process.env.DATABASE_URL) {
    return {
      success: false,
      message:
        "DATABASE_URL is not configured on the backend. Schema changes must use the managed Supabase migrations.",
    };
  }

  try {
    const { Client } = await import("pg");
    const client = new Client({
      connectionString: getPostgresConnectionString(),
    });
    await client.connect();
    await client.query(`
      create table if not exists public.curator_settings (
        id text primary key default 'default',
        data jsonb not null,
        updated_at timestamptz not null default timezone('utc', now())
      )
    `);
    await client.end();

    return {
      success: true,
      message:
        "Database compatibility table verified through the backend PostgreSQL connection.",
    };
  } catch (error: any) {
    console.error("Database table verification failed:", error?.message);
    return {
      success: false,
      message: `Failed to verify compatibility table: ${error?.message}`,
    };
  }
}

// Runtime settings are assembled from normalized tables whenever the backend
// PostgreSQL connection is available. REST/JSON remains only as a local-dev
// compatibility fallback and is not the production source of truth.
export async function readSupabaseDb(): Promise<any | null> {
  if (process.env.DATABASE_URL) {
    try {
      return await runtimeSettingsRepository.read();
    } catch (error: any) {
      console.error(
        "Normalized PostgreSQL settings read failed:",
        error?.message || error
      );
      throw error;
    }
  }

  return readLegacySettingsViaRest();
}

export async function writeSupabaseDb(settings: any): Promise<boolean> {
  if (process.env.DATABASE_URL) {
    try {
      return await runtimeSettingsRepository.write(settings);
    } catch (error: any) {
      console.error(
        "Normalized PostgreSQL settings write failed:",
        error?.message || error
      );
      throw error;
    }
  }

  return writeLegacySettingsViaRest(settings);
}
