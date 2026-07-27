-- Cartrack — sync automático a cada 15 minutos (todas as integrações multi-tenant)
--
-- A Cartrack é uma API REST directa (não robô Apify), por isso tem o seu próprio
-- agendamento dedicado — não passa pelo sync-orchestrator (que está desligado).
--
-- A função cartrack-scheduled-sync percorre dinamicamente todas as integrações
-- cartrack com ativo=true e sync_automatico!=false, e chama o cartrack-sync de
-- cada uma. Novos tenants são apanhados automaticamente, sem migrations extra.
--
-- pg_cron opera em UTC. */15 = a cada quarto de hora.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cartrack-scheduled-sync') THEN
    PERFORM cron.unschedule('cartrack-scheduled-sync');
  END IF;
END $$;

SELECT cron.schedule(
  'cartrack-scheduled-sync',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/cartrack-scheduled-sync',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcXp6eGdlZWRzbWpuaHlxdWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4ODQyMTAsImV4cCI6MjA2NDQ2MDIxMH0.E-x-p5RjQoZfyw6YVwQlWC-Ao27-IPWvyqRIM0PzA-U"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
