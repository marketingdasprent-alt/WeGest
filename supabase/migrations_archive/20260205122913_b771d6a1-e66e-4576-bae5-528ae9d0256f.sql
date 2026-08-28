-- Habilitar extensões necessárias para CRON
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Agendar sincronização completa a cada 6 horas
SELECT cron.schedule(
  'bolt-auto-sync',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/bolt-full-sync',
    headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcXp6eGdlZWRzbWpuaHlxdWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4ODQyMTAsImV4cCI6MjA2NDQ2MDIxMH0.E-x-p5RjQoZfyw6YVwQlWC-Ao27-IPWvyqRIM0PzA-U", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);