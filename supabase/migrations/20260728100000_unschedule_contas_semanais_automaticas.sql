-- Desliga o envio e o cálculo automáticos das contas semanais dos
-- motoristas. Decisão: esta parte não deve ser automática — a equipa
-- passa a usar o fluxo manual já existente em Administrativo → Contas
-- (ContasResumoTab: "Fechar Período" + envio individual por
-- WhatsApp/email/PDF na conta do motorista).
--
-- 'send-weekly-settlements' (seg. 06:20) mandava um email automático,
-- sem revisão humana, a todos os motoristas com email — introduzido em
-- 20260727300000_cron_send_weekly_settlements.sql.
-- 'fechar-semana-financeiro' (seg. 06:00) calculava e gravava os valores
-- em motorista_resumo_semanal/viatura_resumo_semanal — introduzido em
-- 20260720120001_cron_fechar_semana_financeiro.sql.
--
-- Idempotente (ignora erro se o job já não existir).

DO $$
BEGIN
  PERFORM cron.unschedule('send-weekly-settlements');
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('fechar-semana-financeiro');
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
