-- Remove the 4 broken cron jobs
SELECT cron.unschedule('bolt-sync-dosmiguel');
SELECT cron.unschedule('bolt-sync-distancia');
SELECT cron.unschedule('bolt-sync-propecas');
SELECT cron.unschedule('bolt-sync-decada');

-- Recreate with CORRECT integracao_id values
SELECT cron.schedule(
  'bolt-sync-dosmiguel',
  '5 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/bolt-full-sync',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcXp6eGdlZWRzbWpuaHlxdWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4ODQyMTAsImV4cCI6MjA2NDQ2MDIxMH0.E-x-p5RjQoZfyw6YVwQlWC-Ao27-IPWvyqRIM0PzA-U"}'::jsonb,
    body := '{"integracao_id":"d824a141-2453-439e-9179-5153153ea1dd","days_back":1}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'bolt-sync-distancia',
  '10 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/bolt-full-sync',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcXp6eGdlZWRzbWpuaHlxdWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4ODQyMTAsImV4cCI6MjA2NDQ2MDIxMH0.E-x-p5RjQoZfyw6YVwQlWC-Ao27-IPWvyqRIM0PzA-U"}'::jsonb,
    body := '{"integracao_id":"4c4fbdcd-3c80-452f-b7b7-9cbdffd015a0","days_back":1}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'bolt-sync-propecas',
  '15 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/bolt-full-sync',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcXp6eGdlZWRzbWpuaHlxdWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4ODQyMTAsImV4cCI6MjA2NDQ2MDIxMH0.E-x-p5RjQoZfyw6YVwQlWC-Ao27-IPWvyqRIM0PzA-U"}'::jsonb,
    body := '{"integracao_id":"a7dc1a65-05cf-4694-9a79-09860f9311f1","days_back":1}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'bolt-sync-decada',
  '20 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/bolt-full-sync',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcXp6eGdlZWRzbWpuaHlxdWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4ODQyMTAsImV4cCI6MjA2NDQ2MDIxMH0.E-x-p5RjQoZfyw6YVwQlWC-Ao27-IPWvyqRIM0PzA-U"}'::jsonb,
    body := '{"integracao_id":"a49ad68d-abc6-4c17-973a-2b75bf1f5f12","days_back":1}'::jsonb
  ) AS request_id;
  $$
);