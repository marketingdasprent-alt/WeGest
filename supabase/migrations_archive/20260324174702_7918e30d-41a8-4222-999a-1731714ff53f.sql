
-- Create the single sync_orchestrator cron job (runs every 5 minutes)
SELECT cron.schedule(
  'sync_orchestrator',
  '*/5 * * * *',
  format(
    'SELECT net.http_post(url:=%L, headers:=%L::jsonb, body:=%L::jsonb) AS request_id',
    'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/sync-orchestrator',
    json_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcXp6eGdlZWRzbWpuaHlxdWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4ODQyMTAsImV4cCI6MjA2NDQ2MDIxMH0.E-x-p5RjQoZfyw6YVwQlWC-Ao27-IPWvyqRIM0PzA-U')::text,
    '{}'
  )
);
