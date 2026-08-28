-- supabase/migrations/20260717120001_cron_resumo_semanal_viaturas.sql
-- Corre toda 2ª-feira às 06:00 UTC, mesma janela de
-- gerar-cobrancas-tvde-semanais — processa a semana que acabou de fechar.
DO $$
BEGIN
  PERFORM cron.unschedule('gerar-resumo-semanal-viaturas');
EXCEPTION
  WHEN OTHERS THEN
    NULL; -- job ainda não existia — ok.
END $$;

SELECT cron.schedule(
  'gerar-resumo-semanal-viaturas',
  '0 6 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/gerar-resumo-semanal-viaturas',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcXp6eGdlZWRzbWpuaHlxdWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4ODQyMTAsImV4cCI6MjA2NDQ2MDIxMH0.E-x-p5RjQoZfyw6YVwQlWC-Ao27-IPWvyqRIM0PzA-U"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
