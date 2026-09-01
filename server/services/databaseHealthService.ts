import { getPostgresPool } from "../utils/postgresPool";

const BACKEND_RUNTIME_TABLES = [
  "source_channels",
  "filters",
  "destination_targets",
  "ai_settings",
  "posts",
  "curator_settings",
] as const;

type BackendRuntimeTable = (typeof BACKEND_RUNTIME_TABLES)[number];

export interface DatabaseHealth {
  backendMode: "normalized-postgres" | "unavailable";
  runtime: {
    ready: boolean;
    readyCount: number;
    requiredCount: number;
    tables: Array<{ name: BackendRuntimeTable; ready: boolean }>;
  };
  counts: {
    sourceChannels: number;
    destinationTargets: number;
    inboxPosts: number;
    postedPosts: number;
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
      tables: BACKEND_RUNTIME_TABLES.map(name => ({ name, ready: false })),
    },
    counts: {
      sourceChannels: 0,
      destinationTargets: 0,
      inboxPosts: 0,
      postedPosts: 0,
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
    const schemaResult = await pool.query(
      `
        select
          to_regclass('public.source_channels') is not null as source_channels,
          to_regclass('public.filters') is not null as filters,
          to_regclass('public.destination_targets') is not null as destination_targets,
          to_regclass('public.ai_settings') is not null as ai_settings,
          to_regclass('public.posts') is not null as posts,
          to_regclass('public.curator_settings') is not null as curator_settings
      `
    );

    const schemaRow = schemaResult.rows[0] ?? {};
    const tables = BACKEND_RUNTIME_TABLES.map(name => ({
      name,
      ready: schemaRow[name] === true,
    }));
    const readyCount = tables.filter(table => table.ready).length;
    const runtimeReady = readyCount === BACKEND_RUNTIME_TABLES.length;

    const health: DatabaseHealth = {
      ...emptyHealth(),
      backendMode: "normalized-postgres",
      runtime: {
        ready: runtimeReady,
        readyCount,
        requiredCount: BACKEND_RUNTIME_TABLES.length,
        tables,
      },
    };

    if (runtimeReady) {
      const countsResult = await pool.query(
        `
          select
            (select count(*) from public.source_channels)::bigint as source_channels,
            (select count(*) from public.destination_targets)::bigint as destination_targets,
            (
              select count(*)
              from public.posts
              where status in ('pending','archived')
                and coalesce(published_at, created_at) >= now() - interval '24 hours'
            )::bigint as inbox_posts,
            (select count(*) from public.posts where status = 'posted')::bigint as posted_posts
        `
      );
      const counts = countsResult.rows[0] ?? {};
      health.counts = {
        sourceChannels: Number(counts.source_channels ?? 0),
        destinationTargets: Number(counts.destination_targets ?? 0),
        inboxPosts: Number(counts.inbox_posts ?? 0),
        postedPosts: Number(counts.posted_posts ?? 0),
      };

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
        [BACKEND_RUNTIME_TABLES]
      );

      const protectedCount = securityResult.rows.filter(
        row => row.rls_enabled && !row.anon_has_dml && !row.authenticated_has_dml
      ).length;
      health.security = {
        ready: protectedCount === BACKEND_RUNTIME_TABLES.length,
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
          where j.jobname in ('tgreposter-inbox-import', 'tgreposter-inbox-cleanup')
          order by j.jobname
        `
      );

      jobs = jobsResult.rows.map(row => ({
        name: String(row.jobname),
        schedule: String(row.schedule),
        active: !!row.active,
        ...(row.last_status ? { lastStatus: String(row.last_status) } : {}),
        ...(row.last_start_time
          ? { lastRunAt: new Date(row.last_start_time).toISOString() }
          : {}),
        ...(row.last_return_message
          ? { lastReturnMessage: String(row.last_return_message) }
          : {}),
      }));
    }

    const requiredJobNames = new Set([
      "tgreposter-inbox-import",
      "tgreposter-inbox-cleanup",
    ]);
    const activeRequiredJobs = jobs.filter(
      job => requiredJobNames.has(job.name) && job.active
    );

    health.automation = {
      ready:
        pgCronInstalled &&
        pgNetInstalled &&
        activeRequiredJobs.length === requiredJobNames.size,
      pgCronInstalled,
      pgNetInstalled,
      jobs,
    };

    return health;
  } catch (error: any) {
    return emptyHealth(error?.message || "Database health check failed.");
  }
}
