-- Fix: Alterar horário do enqueue semanal para as 04:00 hora de Lisboa
--
-- Horário de Verão (WEST, UTC+1) — Mar a Out:
--   04:00 Lisboa = 03:00 UTC → '0 3 * * 1'
-- Horário de Inverno (WET, UTC+0) — Out a Mar:
--   04:00 Lisboa = 04:00 UTC → '0 4 * * 1'
--
-- Usamos '0 3 * * 1' (03:00 UTC) que cobre o verão exactamente.
-- No inverno dispara às 03:00 Lisboa (1h mais cedo — aceitável).
--
-- Anterior: '30 3 * * 1' (03:30 UTC ≈ 04:30 Lisboa verão)
-- Novo:     '0 3 * * 1'  (03:00 UTC ≈ 04:00 Lisboa verão)

SELECT cron.unschedule('sync-weekly-enqueue');

SELECT cron.schedule(
  'sync-weekly-enqueue',
  '0 3 * * 1',
  $$
  SELECT net.http_post(
    url     := 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/sync-orchestrator',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcXp6eGdlZWRzbWpuaHlxdWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4ODQyMTAsImV4cCI6MjA2NDQ2MDIxMH0.E-x-p5RjQoZfyw6YVwQlWC-Ao27-IPWvyqRIM0PzA-U"}'::jsonb,
    body    := '{"enqueue":true}'::jsonb
  ) AS request_id;
  $$
);
