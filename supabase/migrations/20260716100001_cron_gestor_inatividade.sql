-- supabase/migrations/20260716100001_cron_gestor_inatividade.sql
-- Cron diário às 7h00 (antes do cron de alertas de expiração às 8h00) para
-- ativar/concluir períodos de inatividade de gestores.
select cron.schedule(
  'gestor-inatividade-diario',
  '0 7 * * *',
  $$
  select net.http_post(
    url := 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/process-gestor-inatividade',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcXp6eGdlZWRzbWpuaHlxdWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4ODQyMTAsImV4cCI6MjA2NDQ2MDIxMH0.E-x-p5RjQoZfyw6YVwQlWC-Ao27-IPWvyqRIM0PzA-U"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
