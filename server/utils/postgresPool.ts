import { Pool } from "pg";
import { getPostgresConnectionString } from "./postgresConnection";

let pool: Pool | null = null;

export function getPostgresPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getPostgresConnectionString(),
      max: 8,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }

  return pool;
}
