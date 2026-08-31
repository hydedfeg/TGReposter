import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePostgresConnectionString,
  rewriteSupabaseDirectConnectionToPooler,
  PostgresConnectionConfigError,
} from "../server/utils/postgresConnection";

test("PostgreSQL URL normalization preserves a valid Supabase URL", () => {
  const input =
    "postgresql://postgres.project:encoded%23password@aws-0-eu-north-1.pooler.supabase.com:6543/postgres?sslmode=require";
  assert.equal(normalizePostgresConnectionString(input), input);
});

test("PostgreSQL URL normalization repairs copied psql wrappers and reserved password characters", () => {
  const normalized = normalizePostgresConnectionString(
    "psql 'postgresql://postgres.project:p@ss#word?value@aws-0-eu-north-1.pooler.supabase.com:6543/postgres?sslmode=require'"
  );

  const parsed = new URL(normalized);
  assert.equal(parsed.protocol, "postgresql:");
  assert.equal(parsed.hostname, "aws-0-eu-north-1.pooler.supabase.com");
  assert.equal(parsed.username, "postgres.project");
  assert.equal(decodeURIComponent(parsed.password), "p@ss#word?value");
  assert.equal(parsed.searchParams.get("sslmode"), "require");
  assert.equal(parsed.searchParams.get("uselibpqcompat"), "true");
});

test("PostgreSQL URL normalization accepts DATABASE_URL assignment syntax", () => {
  const normalized = normalizePostgresConnectionString(
    "DATABASE_URL=postgres://postgres:secret@db.example.test:5432/postgres"
  );
  assert.equal(
    normalized,
    "postgres://postgres:secret@db.example.test:5432/postgres"
  );
});

test("invalid database configuration fails closed without echoing credentials", () => {
  const secretInput = "https://example.test/private-secret";
  assert.throws(
    () => normalizePostgresConnectionString(secretInput),
    (error: any) => {
      assert.ok(error instanceof PostgresConnectionConfigError);
      assert.equal(error.message.includes("private-secret"), false);
      return true;
    }
  );
});

test("missing DATABASE_URL produces a configuration error", () => {
  assert.throws(
    () => normalizePostgresConnectionString(undefined),
    (error: any) => {
      assert.ok(error instanceof PostgresConnectionConfigError);
      assert.match(error.message, /DATABASE_URL is missing/);
      return true;
    }
  );
});


test("Supabase direct connection is rewritten to the IPv4-compatible session pooler", () => {
  const direct =
    "postgresql://postgres:secret@db.biowrbnafkagaafonzws.supabase.co:5432/postgres";

  const pooled = rewriteSupabaseDirectConnectionToPooler(direct, {
    region: "eu-north-1",
  });
  const parsed = new URL(pooled);

  assert.equal(parsed.hostname, "aws-0-eu-north-1.pooler.supabase.com");
  assert.equal(parsed.port, "5432");
  assert.equal(parsed.username, "postgres.biowrbnafkagaafonzws");
  assert.equal(parsed.pathname, "/postgres");
  assert.equal(parsed.searchParams.get("sslmode"), "require");
  assert.equal(parsed.searchParams.get("uselibpqcompat"), "true");
  assert.equal(decodeURIComponent(parsed.password), "secret");
});

test("Supabase pooler host override is supported without exposing credentials", () => {
  const direct =
    "postgresql://postgres:p%40ss@db.biowrbnafkagaafonzws.supabase.co:5432/postgres?connect_timeout=10";

  const pooled = rewriteSupabaseDirectConnectionToPooler(direct, {
    poolerHost: "custom.pooler.supabase.com",
  });
  const parsed = new URL(pooled);

  assert.equal(parsed.hostname, "custom.pooler.supabase.com");
  assert.equal(parsed.username, "postgres.biowrbnafkagaafonzws");
  assert.equal(decodeURIComponent(parsed.password), "p@ss");
  assert.equal(parsed.searchParams.get("connect_timeout"), "10");
  assert.equal(parsed.searchParams.get("sslmode"), "require");
});

test("Supabase direct connection fails closed when no pooler routing is configured", () => {
  assert.throws(
    () =>
      rewriteSupabaseDirectConnectionToPooler(
        "postgresql://postgres:secret@db.biowrbnafkagaafonzws.supabase.co:5432/postgres"
      ),
    (error: any) => {
      assert.ok(error instanceof PostgresConnectionConfigError);
      assert.match(error.message, /SUPABASE_DB_REGION|SUPABASE_DB_POOLER_HOST/);
      return true;
    }
  );
});


test("Supabase pooler preserves explicit verify-full without weakening certificate verification", () => {
  const direct =
    "postgresql://postgres:secret@db.biowrbnafkagaafonzws.supabase.co:5432/postgres?sslmode=verify-full";

  const pooled = rewriteSupabaseDirectConnectionToPooler(direct, {
    region: "eu-north-1",
  });
  const parsed = new URL(pooled);

  assert.equal(parsed.searchParams.get("sslmode"), "verify-full");
  assert.equal(parsed.searchParams.get("uselibpqcompat"), null);
});
