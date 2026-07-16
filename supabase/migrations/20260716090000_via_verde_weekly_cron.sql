-- Via Verde — sync automático semanal (todas as integrações multi-tenant)
--
-- Corre toda segunda-feira às 03:00 UTC = 04:00 WEST (Lisbon no verão).
-- No inverno (WET = UTC+0) corre às 03:00 WET — hora aceitável para sync nocturno.
-- pg_cron no Supabase opera em UTC, daí o offset.
--
-- A função via-verde-scheduled-sync percorre dinamicamente todas as integrações
-- via_verde com sync_automatico=true — novos tenants são apanhados automaticamente,
-- sem necessidade de migrations adicionais.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'via-verde-weekly-sync') THEN
    PERFORM cron.unschedule('via-verde-weekly-sync');
  END IF;
END $$;

SELECT cron.schedule(
  'via-verde-weekly-sync',
  '0 3 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/via-verde-scheduled-sync',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcXp6eGdlZWRzbWpuaHlxdWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4ODQyMTAsImV4cCI6MjA2NDQ2MDIxMH0.E-x-p5RjQoZfyw6YVwQlWC-Ao27-IPWvyqRIM0PzA-U"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
