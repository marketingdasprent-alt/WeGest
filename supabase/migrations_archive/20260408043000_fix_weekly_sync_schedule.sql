-- Fix: split sync into two separate cron jobs with clear responsibilities
--
-- ENQUEUE job: Monday 4:30 AM Lisbon time (UTC+1 summer / UTC+0 winter)
--   Summer  (Mar–Oct): 4:30 WEST = 03:30 UTC → '30 3 * * 1'
--   Winter  (Oct–Mar): 4:30 WET  = 04:30 UTC → '30 4 * * 1'
--   Using 03:30 UTC covers summer; in winter it fires at 03:30 AM (30 min early, acceptable).
--
-- DRAIN job: every 10 minutes — processes ONE integration per tick.
--   Since only the ENQUEUE job populates the queue (once per week),
--   the drain job is a no-op all week except after Monday 4:30 AM.

-- Remove the old combined job (ran every 10 min AND enqueued)
SELECT cron.unschedule('sync_orchestrator');

-- 1. Weekly ENQUEUE job — Monday 3:30 UTC (≈ 4:30 AM Lisbon summer time)
SELECT cron.schedule(
  'sync-weekly-enqueue',
  '30 3 * * 1',
  $$
  SELECT net.http_post(
    url     := 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/sync-orchestrator',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcXp6eGdlZWRzbWpuaHlxdWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4ODQyMTAsImV4cCI6MjA2NDQ2MDIxMH0.E-x-p5RjQoZfyw6YVwQlWC-Ao27-IPWvyqRIM0PzA-U"}'::jsonb,
    body    := '{"enqueue":true}'::jsonb
  ) AS request_id;
  $$
);

-- 2. Drain job — every 10 minutes (processes the next queued integration)
--    This is a no-op all week; only does work after Monday 4:30 AM enqueue.
SELECT cron.schedule(
  'sync-drain',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/sync-orchestrator',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcXp6eGdlZWRzbWpuaHlxdWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4ODQyMTAsImV4cCI6MjA2NDQ2MDIxMH0.E-x-p5RjQoZfyw6YVwQlWC-Ao27-IPWvyqRIM0PzA-U"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
