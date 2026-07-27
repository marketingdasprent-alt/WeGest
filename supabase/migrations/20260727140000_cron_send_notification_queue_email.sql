-- Motor de Automação — Fase 2, Sub-projeto 5: agenda o worker do canal
-- email a cada 5 minutos. Mesmo padrão net.http_post já usado para
-- send-calendar-reminders (URL do projeto fixa, verify_jwt=false).
-- Ver docs/superpowers/plans/2026-07-27-motor-automacao-worker-email.md.

select cron.schedule(
  'send-notification-queue-email-frequente',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/send-notification-queue-email',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
