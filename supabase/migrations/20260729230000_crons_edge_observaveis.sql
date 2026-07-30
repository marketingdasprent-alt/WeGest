-- ============================================================
-- Os 9 crons de edge function passam a ser observáveis
-- ============================================================
-- Cada um chamava net.http_post directamente, com o JWT copiado no comando. A
-- invocação não deixava rasto: quando falhava, não havia forma de saber. Foi
-- exactamente por isso que 66% das invocações dos crons novos estavam a falhar
-- enquanto o pg_cron reportava sucesso — o job corre com êxito, o pedido HTTP é
-- que não.
--
-- Passam a chamar public.cron_invocar_edge(), que registra cada invocação em
-- cron_http_log com o request_id do pg_net. A vista cron_edge_health cruza isso
-- com net._http_response e mostra o status HTTP real. Cobertura: 12 de 12.
--
-- PRÉ-REQUISITO, e não é opcional: 20260729220000_cron_jwt_no_vault.sql. O helper
-- resolvia o JWT lendo-o do comando de um cron que ainda o tivesse inline; migrar
-- estes 9 sem isso apagava a única fonte do token e derrubava os 12 crons de uma
-- vez. O JWT vive agora no Vault.
--
-- Horário, função e body de cada cron ficam IGUAIS. O que muda é como o pedido é
-- feito, não o que é pedido nem quando.
--
-- Efeito colateral assumido: o timeout passa a 60s (os comandos antigos omitiam
-- timeout_milliseconds e usavam o valor por omissão do pg_net). Como estes crons
-- são fire-and-forget, isto não altera se a função corre — altera se a resposta
-- chega a tempo de ser registada, que é o objectivo.
--
-- Idempotente: o unschedule é guardado por EXISTS, logo pode correr-se de novo.

-- ── Diários ────────────────────────────────────────────────────────────────
select cron.unschedule('alertas-expiracoes-diario')
where exists (select 1 from cron.job where jobname = 'alertas-expiracoes-diario');

select cron.schedule(
  'alertas-expiracoes-diario',
  '0 8 * * *',
  $$select public.cron_invocar_edge('alertas-expiracoes-diario', 'send-alertas-expiracoes', '{}'::jsonb, 60000)$$
);

select cron.unschedule('gestor-inatividade-diario')
where exists (select 1 from cron.job where jobname = 'gestor-inatividade-diario');

select cron.schedule(
  'gestor-inatividade-diario',
  '0 7 * * *',
  $$select public.cron_invocar_edge('gestor-inatividade-diario', 'process-gestor-inatividade', '{}'::jsonb, 60000)$$
);

-- ── Horários ───────────────────────────────────────────────────────────────
select cron.unschedule('send-calendar-reminders-hourly')
where exists (select 1 from cron.job where jobname = 'send-calendar-reminders-hourly');

select cron.schedule(
  'send-calendar-reminders-hourly',
  '0 * * * *',
  $$select public.cron_invocar_edge('send-calendar-reminders-hourly', 'send-calendar-reminders', '{}'::jsonb, 60000)$$
);

-- ATENÇÃO a quem passar por aqui: o nome diz "weekly" mas o horário é HORÁRIO, e
-- é de propósito. A própria função via-verde-scheduled-sync verifica
-- sync_dia_semana/sync_hora e só age na janela configurada. Passar isto a semanal
-- quebrava a configuração por integração.
select cron.unschedule('via-verde-weekly-sync')
where exists (select 1 from cron.job where jobname = 'via-verde-weekly-sync');

select cron.schedule(
  'via-verde-weekly-sync',
  '0 * * * *',
  $$select public.cron_invocar_edge('via-verde-weekly-sync', 'via-verde-scheduled-sync', '{}'::jsonb, 60000)$$
);

-- ── Frequentes ─────────────────────────────────────────────────────────────
-- Este era o único sem cabeçalho Authorization nenhum (a função tem
-- verify_jwt = false). Passa a levar o JWT anónimo, o que é inofensivo para uma
-- função que não o verifica.
select cron.unschedule('send-notification-queue-email-frequente')
where exists (select 1 from cron.job where jobname = 'send-notification-queue-email-frequente');

select cron.schedule(
  'send-notification-queue-email-frequente',
  '*/5 * * * *',
  $$select public.cron_invocar_edge('send-notification-queue-email-frequente', 'send-notification-queue-email', '{}'::jsonb, 60000)$$
);

select cron.unschedule('sync-drain')
where exists (select 1 from cron.job where jobname = 'sync-drain');

select cron.schedule(
  'sync-drain',
  '*/10 * * * *',
  $$select public.cron_invocar_edge('sync-drain', 'sync-orchestrator', '{}'::jsonb, 60000)$$
);

select cron.unschedule('via-verde-sync-drain')
where exists (select 1 from cron.job where jobname = 'via-verde-sync-drain');

select cron.schedule(
  'via-verde-sync-drain',
  '*/5 * * * *',
  $$select public.cron_invocar_edge('via-verde-sync-drain', 'via-verde-sync-drain', '{}'::jsonb, 60000)$$
);

-- ── Par de horário de verão ────────────────────────────────────────────────
-- Os dois existem de propósito: 03:00 e 04:00 de segunda cobrem a hora que muda
-- com o horário de verão. Não duplicam trabalho porque sync-orchestrator ignora
-- integrações já em pending/running. Mexer num só quebrava o par.
select cron.unschedule('sync-weekly-enqueue-summer')
where exists (select 1 from cron.job where jobname = 'sync-weekly-enqueue-summer');

select cron.schedule(
  'sync-weekly-enqueue-summer',
  '0 3 * * 1',
  $$select public.cron_invocar_edge('sync-weekly-enqueue-summer', 'sync-orchestrator', '{"enqueue":true}'::jsonb, 60000)$$
);

select cron.unschedule('sync-weekly-enqueue-winter')
where exists (select 1 from cron.job where jobname = 'sync-weekly-enqueue-winter');

select cron.schedule(
  'sync-weekly-enqueue-winter',
  '0 4 * * 1',
  $$select public.cron_invocar_edge('sync-weekly-enqueue-winter', 'sync-orchestrator', '{"enqueue":true}'::jsonb, 60000)$$
);
