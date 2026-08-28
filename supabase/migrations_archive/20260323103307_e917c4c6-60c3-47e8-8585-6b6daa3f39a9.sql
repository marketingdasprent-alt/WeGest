
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Schedule weekly robot-execute for Uber every Monday at 00:00 Lisbon time
-- Using 23:00 UTC Sunday = 00:00 WET Monday (winter) / 00:00 WEST Monday (summer ~= 23:00 UTC)
-- pg_cron on Supabase runs in UTC, so we use 0 23 * * 0 for consistency
SELECT cron.schedule(
  'uber-robot-weekly-sync',
  '0 23 * * 0',
  $$
  SELECT net.http_post(
    url := 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/robot-execute',
    headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcXp6eGdlZWRzbWpuaHlxdWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4ODQyMTAsImV4cCI6MjA2NDQ2MDIxMH0.E-x-p5RjQoZfyw6YVwQlWC-Ao27-IPWvyqRIM0PzA-U", "Content-Type": "application/json"}'::jsonb,
    body := '{"integracao_id": "57e5685d-a8be-4e0f-9191-c2d7d2740dc2"}'::jsonb
  );
  $$
);
