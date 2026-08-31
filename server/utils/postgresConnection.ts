export class PostgresConnectionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PostgresConnectionConfigError";
  }
}

function canonicalCredential(value: string): string {
  try {
    return encodeURIComponent(decodeURIComponent(value));
  } catch {
    return encodeURIComponent(value);
  }
}

function stripCopiedCommand(raw: string): string {
  let value = raw.trim();

  if (/^DATABASE_URL\s*=/i.test(value)) {
    value = value.replace(/^DATABASE_URL\s*=\s*/i, "").trim();
  }

  const schemeIndex = value.search(/postgres(?:ql)?:\/\//i);
  if (schemeIndex > 0) value = value.slice(schemeIndex);

  value = value.trim();

  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    value = value.slice(1, -1).trim();
  }

  // If the URL was extracted from a quoted psql command, the leading command
  // text is gone and only a trailing quote may remain.
  value = value.replace(/['"]\s*;?\s*$/, "").trim();
  return value;
}

export function normalizePostgresConnectionString(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new PostgresConnectionConfigError(
      "Promotion database access is not configured. DATABASE_URL is missing."
    );
  }

  const value = stripCopiedCommand(raw);
  const match = value.match(/^(postgres(?:ql)?):\/\/(.+)$/is);
  if (!match) {
    throw new PostgresConnectionConfigError(
      "DATABASE_URL must be a PostgreSQL connection URL beginning with postgres:// or postgresql://."
    );
  }

  const scheme = match[1].toLowerCase();
  const body = match[2];
  const atIndex = body.lastIndexOf("@");

  let normalized = value;
  if (atIndex > 0) {
    const authority = body.slice(0, atIndex);
    const location = body.slice(atIndex + 1);
    const colonIndex = authority.indexOf(":");

    if (colonIndex > 0) {
      const username = canonicalCredential(authority.slice(0, colonIndex));
      const password = canonicalCredential(authority.slice(colonIndex + 1));
      normalized = `${scheme}://${username}:${password}@${location}`;
    }
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
      throw new Error("Unsupported database protocol.");
    }
    if (!parsed.hostname) throw new Error("Database host is missing.");
    return normalized;
  } catch {
    throw new PostgresConnectionConfigError(
      "DATABASE_URL is malformed. Configure a valid Supabase PostgreSQL connection string."
    );
  }
}

export function getPostgresConnectionString(): string {
  return normalizePostgresConnectionString(process.env.DATABASE_URL);
}
