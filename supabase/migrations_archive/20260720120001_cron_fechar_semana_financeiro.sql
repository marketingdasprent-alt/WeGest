-- supabase/migrations/20260720120001_cron_fechar_semana_financeiro.sql
DO $$
BEGIN
  PERFORM cron.unschedule('gerar-resumo-semanal-viaturas');
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('fechar-semana-financeiro');
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'fechar-semana-financeiro',
  '0 6 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/fechar-semana-financeiro',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcXp6eGdlZWRzbWpuaHlxdWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4ODQyMTAsImV4cCI6MjA2NDQ2MDIxMH0.E-x-p5RjQoZfyw6YVwQlWC-Ao27-IPWvyqRIM0PzA-U"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
