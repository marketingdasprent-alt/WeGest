-- Fix: process integrations sequentially with 10-minute gaps
-- Previous setup ran the orchestrator once weekly → only 1 integration ran per week
-- New setup: runs every 10 minutes. Since intervalo_sync_horas = 168h (weekly),
-- integrations only get enqueued once per week (Monday ~00:00 Lisbon).
-- The queue is then drained one-by-one, 10 minutes apart.

SELECT cron.unschedule('sync_orchestrator');

SELECT cron.schedule(
  'sync_orchestrator',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url:='https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/sync-orchestrator',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcXp6eGdlZWRzbWpuaHlxdWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4ODQyMTAsImV4cCI6MjA2NDQ2MDIxMH0.E-x-p5RjQoZfyw6YVwQlWC-Ao27-IPWvyqRIM0PzA-U"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);

-- Mark all active integrations as overdue so they run in the next 10 minutes
-- (they already missed Monday midnight due to the bug)
UPDATE plataformas_configuracao
SET ultimo_sync = now() - interval '168 hours'
WHERE sync_automatico = true
  AND ativo = true;
