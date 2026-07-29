-- supabase/migrations/20260729160000_acordos_crons_ligar.sql
-- ============================================================
-- Liga os 2 workers automáticos do parcelamento de faturas
-- ============================================================
-- Separado de 20260724100004_acordos_crons.sql de propósito: a função
-- acordos_manutencao_diaria já está aplicada à BD real desde 2026-07-28,
-- mas os crons em si só devem ligar quando o utilizador der OK final para
-- ir para o ar a sério (ver acompanhamento na branch ParcelamentoFaturas).
-- NÃO aplicar antes disso.
--
-- 06:00 UTC dá folga suficiente em qualquer estação para que o cálculo de
-- "hoje" em Europe/Lisbon (feito dentro do worker) não escorregue um dia.
SELECT cron.schedule(
  'faturacao-outbox-drain',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/faturacao-outbox-drain',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcXp6eGdlZWRzbWpuaHlxdWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4ODQyMTAsImV4cCI6MjA2NDQ2MDIxMH0.E-x-p5RjQoZfyw6YVwQlWC-Ao27-IPWvyqRIM0PzA-U"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'acordos-parcelas-diario',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/acordos-parcelas-diario',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcXp6eGdlZWRzbWpuaHlxdWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4ODQyMTAsImV4cCI6MjA2NDQ2MDIxMH0.E-x-p5RjQoZfyw6YVwQlWC-Ao27-IPWvyqRIM0PzA-U"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
