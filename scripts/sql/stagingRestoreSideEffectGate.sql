-- Read-only probe. Run only on a privately restored, network-isolated DB.
SELECT jsonb_build_object(
 'cronInstalled',(SELECT count(*)=1 FROM pg_extension WHERE extname='pg_cron'),
 'netInstalled',(SELECT count(*)=1 FROM pg_extension WHERE extname='pg_net'),
 'activeCronJobs',(SELECT count(*)::integer FROM cron.job WHERE active),
 'activeHttpCronJobs',(SELECT count(*)::integer FROM cron.job WHERE active AND
   (command ILIKE '%net.http%' OR command ILIKE '%http_post%' OR command ILIKE '%http_get%')),
 'queuedHttpRequests',(SELECT count(*)::integer FROM net.http_request_queue),
 'publicTablesWithoutRls',(SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity),
 'anonymousReadablePublicTables',(SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind IN ('r','p') AND has_table_privilege('anon',c.oid,'SELECT')),
 'authenticatedReadableSensitiveTables',(SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind IN ('r','p') AND
   (c.relname LIKE 'billing_%' OR c.relname LIKE 'crypto_payment_%' OR
    c.relname IN ('ai_unit_ledger','ai_usage_events','source_channels','destination_targets','user_inbox_items','telegram_bot_accounts'))
   AND (has_table_privilege('authenticated',c.oid,'SELECT') OR
        has_table_privilege('authenticated',c.oid,'INSERT') OR
        has_table_privilege('authenticated',c.oid,'UPDATE') OR
        has_table_privilege('authenticated',c.oid,'DELETE'))),
 'anonymousExecutableDefinerFunctions',(SELECT count(*)::integer FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prosecdef AND has_function_privilege('anon',p.oid,'EXECUTE'))
) AS safety_state;
