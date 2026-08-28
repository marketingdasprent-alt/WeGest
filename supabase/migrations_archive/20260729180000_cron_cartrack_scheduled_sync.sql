-- ============================================================
-- Cartrack: o sync automático nunca existiu
-- ============================================================
-- A migração 20260727130000_cartrack_cron.sql (no repositório) devia ter
-- agendado `cartrack-scheduled-sync` a cada 15 minutos. Verificado a
-- 2026-07-29 contra produção:
--
--   • zero migrations com 'cartrack' no ledger (supabase_migrations) — as
--     tabelas cartrack_* foram criadas à mão pelo SQL editor;
--   • zero crons com 'cartrack' em cron.job;
--   • a edge function `cartrack-scheduled-sync` respondia **HTTP 404** — nunca
--     tinha sido deployada, apesar de existir no repositório desde 28/07.
--
-- Consequência: 250 viaturas com GPS, e sincronização automática que nunca
-- correu uma única vez. O mapa "Ao vivo" mostrava o resultado do último clique
-- manual no botão de sync (28/07 19:48).
--
-- O DEFEITO VISÍVEL AO UTILIZADOR: `plataformas_configuracao.sync_automatico`
-- é exposto como um interruptor na UI (IntegracaoDetailModal), mas sem cron
-- nenhum a ler esse valor, ligá-lo não fazia absolutamente nada. Esta migração
-- é o que torna esse interruptor funcional.
--
-- Estado actual da única integração Cartrack: `sync_automatico = false`. Este
-- cron fica portanto DORMENTE até alguém o ligar na UI — de propósito. Ligar a
-- sincronização automática de uma API externa é uma decisão de negócio (passa
-- a haver ~96 chamadas/dia à Cartrack), não algo a impor numa migração.
--
-- A função foi validada antes de ser agendada: HTTP 200 em 0,92 s, e devolveu
-- `{"success":true,"total":0,"results":[]}` — confirmando que respeita o
-- sync_automatico=false em vez de sincronizar às cegas.
-- ============================================================

select cron.unschedule('cartrack-scheduled-sync')
where exists (select 1 from cron.job where jobname = 'cartrack-scheduled-sync');

-- Cadência: a documentada no cabeçalho da função e na migração original (15 min).
-- Timeout de 120 s (contra os 5 s por omissão do pg_net): a função percorre as
-- integrações em série e cada cartrack-sync faz upsert de centenas de viaturas.
-- Bem abaixo do intervalo de 15 min, para uma chamada pendurada nunca se
-- sobrepor à seguinte. Passa pelo cron_invocar_edge para o resultado real ficar
-- visível em cron_edge_health (ver 20260729170000).
select cron.schedule(
  'cartrack-scheduled-sync',
  '*/15 * * * *',
  $$select public.cron_invocar_edge('cartrack-scheduled-sync', 'cartrack-scheduled-sync', '{}'::jsonb, 120000)$$
);
