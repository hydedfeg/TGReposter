import { getPostgresPool } from "../utils/postgresPool";

const TENANT_TABLES = [
  "source_channels",
  "filters",
  "destination_targets",
  "ai_settings",
  "user_inbox_items",
  "telegram_bot_accounts",
  "promotion_targets",
  "promotion_campaigns",
  "promotion_campaign_posts",
  "promotion_deliveries",
  "promotion_delivery_attempts",
] as const;

const SYSTEM_TABLES = [
  "posts",
  "curator_settings",
] as const;

const BACKEND_RUNTIME_TABLES = [
  ...TENANT_TABLES,
  ...SYSTEM_TABLES,
] as const;

type BackendRuntimeTable = (typeof BACKEND_RUNTIME_TABLES)[number];

export interface DatabaseHealth {
  backendMode: "normalized-postgres" | "unavailable";
  runtime: {
    ready: boolean;
    readyCount: number;
    requiredCount: number;
    tables: Array<{
      name: BackendRuntimeTable;
      ready: boolean;
      kind: "tenant" | "system";
    }>;
  };
  tenancy: {
    ready: boolean;
    ownerScopedCount: number;
    expectedCount: number;
    orphanRows: number;
  };
  automation: {
    ready: boolean;
    pgCronInstalled: boolean;
    pgNetInstalled: boolean;
    jobs: Array<{
      name: string;
      schedule: string;
      active: boolean;
      lastStatus?: string;
      lastRunAt?: string;
      lastReturnMessage?: string;
    }>;
  };
  security: {
    ready: boolean;
    protectedCount: number;
    expectedCount: number;
  };
  error?: string;
}

function emptyHealth(error?: string): DatabaseHealth {
  return {
    backendMode: "unavailable",
    runtime: {
      ready: false,
      readyCount: 0,
      requiredCount: BACKEND_RUNTIME_TABLES.length,
      tables: BACKEND_RUNTIME_TABLES.map(name => ({
        name,
        ready: false,
        kind: (TENANT_TABLES as readonly string[]).includes(name)
          ? "tenant"
          : "system",
      })),
    },
    tenancy: {
      ready: false,
      ownerScopedCount: 0,
      expectedCount: TENANT_TABLES.length,
      orphanRows: 0,
    },
    automation: {
      ready: false,
      pgCronInstalled: false,
      pgNetInstalled: false,
      jobs: [],
    },
    security: {
      ready: false,
      protectedCount: 0,
      expectedCount: BACKEND_RUNTIME_TABLES.length,
    },
    ...(error ? { error } : {}),
  };
}

export async function getDatabaseHealth(): Promise<DatabaseHealth> {
  if (!process.env.DATABASE_URL) {
    return emptyHealth("DATABASE_URL is not configured.");
  }

  try {
    const pool = getPostgresPool();

    const tableResult = await pool.query(
      `
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name = any($1::text[])
      `,
      [BACKEND_RUNTIME_TABLES]
    );
    const existingTables = new Set(
      tableResult.rows.map(row => String(row.table_name))
    );

    const tables = BACKEND_RUNTIME_TABLES.map(name => ({
      name,
      ready: existingTables.has(name),
      kind: (TENANT_TABLES as readonly string[]).includes(name)
        ? ("tenant" as const)
        : ("system" as const),
    }));
    const readyCount = tables.filter(table => table.ready).length;

    const health: DatabaseHealth = {
      ...emptyHealth(),
      backendMode: "normalized-postgres",
      runtime: {
        ready: readyCount === BACKEND_RUNTIME_TABLES.length,
        readyCount,
        requiredCount: BACKEND_RUNTIME_TABLES.length,
        tables,
      },
    };

    const ownerColumnsResult = await pool.query(
      `
        select table_name
        from information_schema.columns
        where table_schema = 'public'
          and column_name = 'owner_principal'
          and table_name = any($1::text[])
          and is_nullable = 'NO'
      `,
      [TENANT_TABLES]
    );
    const ownerScopedTables = ownerColumnsResult.rows.map(row =>
      String(row.table_name)
    );
    const ownerScopedCount = ownerScopedTables.length;

    let orphanRows = 0;
    for (const tableName of ownerScopedTables) {
      // tableName is selected from the fixed TENANT_TABLES allow-list above.
      const orphanResult = await pool.query(
        `select count(*)::bigint as count
         from public."${tableName}"
         where owner_principal is null`
      );
      orphanRows += Number(orphanResult.rows[0]?.count ?? 0);
    }

    health.tenancy = {
      ready:
        ownerScopedCount === TENANT_TABLES.length &&
        orphanRows === 0,
      ownerScopedCount,
      expectedCount: TENANT_TABLES.length,
      orphanRows,
    };

    const securityTables = BACKEND_RUNTIME_TABLES.filter(name =>
      existingTables.has(name)
    );
    if (securityTables.length > 0) {
      const securityResult = await pool.query(
        `
          select c.relname as table_name,
                 c.relrowsecurity as rls_enabled,
                 (
                   has_table_privilege('anon', c.oid, 'SELECT')
                   or has_table_privilege('anon', c.oid, 'INSERT')
                   or has_table_privilege('anon', c.oid, 'UPDATE')
                   or has_table_privilege('anon', c.oid, 'DELETE')
                 ) as anon_has_dml,
                 (
                   has_table_privilege('authenticated', c.oid, 'SELECT')
                   or has_table_privilege('authenticated', c.oid, 'INSERT')
                   or has_table_privilege('authenticated', c.oid, 'UPDATE')
                   or has_table_privilege('authenticated', c.oid, 'DELETE')
                 ) as authenticated_has_dml
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and c.relname = any($1::text[])
        `,
        [securityTables]
      );

      const protectedCount = securityResult.rows.filter(
        row =>
          row.rls_enabled &&
          !row.anon_has_dml &&
          !row.authenticated_has_dml
      ).length;

      health.security = {
        ready:
          securityTables.length === BACKEND_RUNTIME_TABLES.length &&
          protectedCount === BACKEND_RUNTIME_TABLES.length,
        protectedCount,
        expectedCount: BACKEND_RUNTIME_TABLES.length,
      };
    }

    const extensionResult = await pool.query(
      `
        select extname
        from pg_extension
        where extname in ('pg_cron', 'pg_net')
      `
    );
    const installedExtensions = new Set(
      extensionResult.rows.map(row => String(row.extname))
    );
    const pgCronInstalled = installedExtensions.has("pg_cron");
    const pgNetInstalled = installedExtensions.has("pg_net");

    let jobs: DatabaseHealth["automation"]["jobs"] = [];
    if (pgCronInstalled) {
      const jobsResult = await pool.query(
        `
          select j.jobname,
                 j.schedule,
                 j.active,
                 r.status as last_status,
                 r.start_time as last_start_time,
                 r.return_message as last_return_message
          from cron.job j
          left join lateral (
            select d.status, d.start_time, d.return_message
            from cron.job_run_details d
            where d.jobid = j.jobid
            order by d.start_time desc
            limit 1
          ) r on true
          where j.jobname in (
            'tgreposter-inbox-import',
            'tgreposter-inbox-cleanup'
          )
          order by j.jobname
        `
      );

      jobs = jobsResult.rows.map(row => ({
        name: String(row.jobname),
        schedule: String(row.schedule),
        active: !!row.active,
        ...(row.last_status
          ? { lastStatus: String(row.last_status) }
          : {}),
        ...(row.last_start_time
          ? { lastRunAt: new Date(row.last_start_time).toISOString() }
          : {}),
        ...(row.last_return_message
          ? { lastReturnMessage: String(row.last_return_message) }
          : {}),
      }));
    }

    const requiredJobs = new Set([
      "tgreposter-inbox-import",
      "tgreposter-inbox-cleanup",
    ]);
    const activeRequired = jobs.filter(
      job => requiredJobs.has(job.name) && job.active
    );

    health.automation = {
      ready:
        pgCronInstalled &&
        pgNetInstalled &&
        activeRequired.length === requiredJobs.size,
      pgCronInstalled,
      pgNetInstalled,
      jobs,
    };

    return health;
  } catch (error: any) {
    return emptyHealth(error?.message || "Database health check failed.");
  }
}
