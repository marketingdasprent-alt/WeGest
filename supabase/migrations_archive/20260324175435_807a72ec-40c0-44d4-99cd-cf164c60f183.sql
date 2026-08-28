-- Re-schedule sync_orchestrator from every 5 minutes to weekly (Sunday 23:00 UTC = Monday 00:00 Lisbon)
SELECT cron.unschedule('sync_orchestrator');

SELECT cron.schedule(
  'sync_orchestrator',
  '0 23 * * 0',
  $$
  SELECT net.http_post(
    url:='https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/sync-orchestrator',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcXp6eGdlZWRzbWpuaHlxdWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4ODQyMTAsImV4cCI6MjA2NDQ2MDIxMH0.E-x-p5RjQoZfyw6YVwQlWC-Ao27-IPWvyqRIM0PzA-U"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);

-- Force all active integrations to weekly interval (168 hours)
UPDATE plataformas_configuracao 
SET intervalo_sync_horas = 168 
WHERE sync_automatico = true;