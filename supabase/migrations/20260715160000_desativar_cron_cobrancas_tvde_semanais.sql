-- ============================================================
-- Desactivar cron gerar-cobrancas-tvde-semanais (pausa cautelar)
-- ============================================================
-- Contexto: fix de 20260714110000 (preço por-modelo) fez a função
-- gerar_cobrancas_tvde_semanais() voltar a gerar cobranças. Mas a
-- função varre TODOS os contratos TVDE em_curso/agendado sem
-- distinguir antiguidade — incluindo ~67 contratos anteriores a
-- 23/06/2026 (alguns desde 2024) que nunca tiveram cobrança.
--
-- Sem esta pausa, a próxima corrida do cron (2ª-feira 06:00 UTC)
-- varreria anos de cobranças semanais em atraso para esses 67
-- contratos de uma só vez, com risco alto de duplicar facturação
-- já feita por outra via antes deste sistema existir.
--
-- Cron fica desactivado até decisão de negócio sobre o cohort B
-- (ver memo interno de facturação TVDE, 2026-07-15). A função em
-- si não é alterada — só o agendamento pg_cron.
--
-- Idempotente: unschedule ignora erro se o job já não existir.
-- ============================================================

DO $$
BEGIN
  PERFORM cron.unschedule('gerar-cobrancas-tvde-semanais');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;
