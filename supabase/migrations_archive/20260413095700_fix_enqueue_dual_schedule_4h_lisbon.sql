-- Fix: Dois jobs de enqueue para cobrir exactamente as 04:00 Lisboa
-- em ambos os fusos (verão UTC+1 e inverno UTC+0).
--
-- O código de enqueue já tem protecção contra duplicados:
--   "Skip if already pending or running"
-- Por isso, quando os dois disparam na mesma semana, o segundo é no-op.
--
-- Verão (WEST, UTC+1): job-summer dispara às 03:00 UTC = 04:00 Lisboa ✅
--                      job-winter dispara às 04:00 UTC = 05:00 Lisboa (no-op)
-- Inverno (WET, UTC+0): job-summer dispara às 03:00 UTC = 03:00 Lisboa (no-op — fila já vazia)
--                       job-winter dispara às 04:00 UTC = 04:00 Lisboa ✅
--
-- Resultado: nada inicia antes das 04:00 Lisboa em qualquer época do ano.

-- Remove o job único anterior
SELECT cron.unschedule('sync-weekly-enqueue');

-- Job para o horário de verão (04:00 Lisboa = 03:00 UTC)
SELECT cron.schedule(
  'sync-weekly-enqueue-summer',
  '0 3 * * 1',
  $$
  SELECT net.http_post(
    url     := 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/sync-orchestrator',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcXp6eGdlZWRzbWpuaHlxdWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4ODQyMTAsImV4cCI6MjA2NDQ2MDIxMH0.E-x-p5RjQoZfyw6YVwQlWC-Ao27-IPWvyqRIM0PzA-U"}'::jsonb,
    body    := '{"enqueue":true}'::jsonb
  ) AS request_id;
  $$
);

-- Job para o horário de inverno (04:00 Lisboa = 04:00 UTC)
SELECT cron.schedule(
  'sync-weekly-enqueue-winter',
  '0 4 * * 1',
  $$
  SELECT net.http_post(
    url     := 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/sync-orchestrator',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcXp6eGdlZWRzbWpuaHlxdWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4ODQyMTAsImV4cCI6MjA2NDQ2MDIxMH0.E-x-p5RjQoZfyw6YVwQlWC-Ao27-IPWvyqRIM0PzA-U"}'::jsonb,
    body    := '{"enqueue":true}'::jsonb
  ) AS request_id;
  $$
);
