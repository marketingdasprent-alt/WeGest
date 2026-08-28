
-- Remove old broken job
SELECT cron.unschedule('bolt-auto-sync');

-- Create 4 new jobs, one per Bolt integration (every 6 hours, staggered)
SELECT cron.schedule(
  'bolt-sync-dosmiguel',
  '5 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/bolt-full-sync',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcXp6eGdlZWRzbWpuaHlxdWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4ODQyMTAsImV4cCI6MjA2NDQ2MDIxMH0.E-x-p5RjQoZfyw6YVwQlWC-Ao27-IPWvyqRIM0PzA-U"}'::jsonb,
    body := '{"integracao_id":"d824a141-c5a5-477b-a50c-1fa818d589b2","days_back":1}'::jsonb
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
    body := '{"integracao_id":"4c4fbdcd-f8e2-48f2-a87c-84c742b5d567","days_back":1}'::jsonb
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
    body := '{"integracao_id":"a7dc1a65-b390-4e51-b465-1c54659f29c1","days_back":1}'::jsonb
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
    body := '{"integracao_id":"a49ad68d-4bac-459e-8955-46fba57f82e6","days_back":1}'::jsonb
  ) AS request_id;
  $$
);
