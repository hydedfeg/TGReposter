import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePostgresConnectionString,
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
