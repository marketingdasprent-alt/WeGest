-- Reativa o acerto de contas semanal (send-bulk-settlements), órfão desde
-- sempre — a função já existia e funcionava, só não era chamada por
-- ninguém. Corre 20 min depois de fechar-semana-financeiro (mesma
-- segunda-feira), para dar tempo ao fecho semanal terminar antes de ler
-- motorista_resumo_semanal. Mesmo padrão net.http_post + Bearer anon já
-- usado por fechar-semana-financeiro e send-notification-queue-email.
select cron.schedule(
  'send-weekly-settlements',
  '20 6 * * 1',
  $$
  select net.http_post(
    url := 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/send-weekly-settlements',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcXp6eGdlZWRzbWpuaHlxdWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4ODQyMTAsImV4cCI6MjA2NDQ2MDIxMH0.E-x-p5RjQoZfyw6YVwQlWC-Ao27-IPWvyqRIM0PzA-U"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
