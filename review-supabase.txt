import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

let rawSupabaseUrl = process.env.SUPABASE_URL;
if (rawSupabaseUrl && !rawSupabaseUrl.startsWith("http://") && !rawSupabaseUrl.startsWith("https://")) {
  if (!rawSupabaseUrl.includes(".")) {
    rawSupabaseUrl = `https://${rawSupabaseUrl}.supabase.co`;
  } else {
    rawSupabaseUrl = `https://${rawSupabaseUrl}`;
  }
}

export const supabaseUrl = rawSupabaseUrl;
export const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

let supabase: any = null;

export function getSupabaseClient() {
  if (!isSupabaseConfigured) return null;
  if (!supabase) {
    supabase = createClient(supabaseUrl!, supabaseAnonKey!);
  }
  return supabase;
}

/**
 * SQL Setup Schema to run in Supabase SQL Editor:
 * 
 * create table if not exists curator_settings (
 *   id text primary key default 'default',
 *   data jsonb not null,
 *   updated_at timestamp with time zone default timezone('utc'::text, now()) not null
 * );
 */

// Check if database table exists
export async function checkTableExists(): Promise<{ exists: boolean; error?: string; methodUsed: string }> {
  // Try using pg direct connection if DATABASE_URL is present
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    try {
      const { Client } = await import("pg");
      const client = new Client({ connectionString: dbUrl });
      await client.connect();
      const res = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'curator_settings'
        );
      `);
      await client.end();
      return { exists: res.rows[0].exists, methodUsed: "Direct PostgreSQL" };
    } catch (e: any) {
      console.warn("Direct PostgreSQL connection check failed, trying REST API:", e.message);
    }
  }

  // Fallback to Supabase client check
  const client = getSupabaseClient();
  if (!client) {
    return { exists: false, error: "Supabase URL and Anon Key are not configured in environment variables.", methodUsed: "REST API" };
  }

  try {
    const { data, error } = await client
      .from("curator_settings")
      .select("id")
      .limit(1);

    if (error) {
      // PostgREST error codes: 
      // PGRST116 means unique row not found or single empty, but table exists
      // 42P01 (often in message/details) or error.code === 'PGRST116' with no rows doesn't mean failure.
      // Let's check if error contains 'does not exist' or code is 42P01.
      if (error.code === "PGRST116") {
        return { exists: true, methodUsed: "REST API" };
      }
      if (error.message && (error.message.includes("does not exist") || error.message.includes("relation"))) {
        return { exists: false, error: "Table 'curator_settings' does not exist in your Supabase database.", methodUsed: "REST API" };
      }
      // If code is "42P01"
      if (error.code === "42P01") {
        return { exists: false, error: "Table 'curator_settings' does not exist in your Supabase database.", methodUsed: "REST API" };
      }
      return { exists: false, error: error.message, methodUsed: "REST API" };
    }
    return { exists: true, methodUsed: "REST API" };
  } catch (err: any) {
    return { exists: false, error: err.message, methodUsed: "REST API" };
  }
}

// Auto-create table using direct PostgreSQL
export async function autoCreateSettingsTable(): Promise<{ success: boolean; message: string }> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return { 
      success: false, 
      message: "Direct PostgreSQL connection string (DATABASE_URL) is not defined in environment variables. Please configure DATABASE_URL in your env settings to run schema updates automatically, or copy the SQL below to run manually in your Supabase SQL Editor." 
    };
  }

  try {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: dbUrl });
    await client.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS curator_settings (
        id TEXT PRIMARY KEY DEFAULT 'default',
        data JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
      );
    `);
    await client.end();
    return { success: true, message: "Database table 'curator_settings' was successfully created and verified using your direct PostgreSQL connection string!" };
  } catch (err: any) {
    console.error("Auto table creation failed:", err.message);
    return { success: false, message: `Failed to create table via direct connection: ${err.message}` };
  }
}

// Read settings from Supabase
export async function readSupabaseDb(): Promise<any | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from("curator_settings")
      .select("data")
      .eq("id", "default")
      .single();

    if (error) {
      console.warn("Supabase fetch notice (table may not exist or empty):", error.message);
      return null;
    }
    return data?.data || null;
  } catch (err: any) {
    console.error("Supabase read exception:", err.message);
    return null;
  }
}

// Write settings to Supabase
export async function writeSupabaseDb(settings: any): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const { error } = await client
      .from("curator_settings")
      .upsert({ id: "default", data: settings, updated_at: new Date().toISOString() });

    if (error) {
      console.error("Supabase write error:", error.message);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error("Supabase write exception:", err.message);
    return false;
  }
}
