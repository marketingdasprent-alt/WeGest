-- ============================================================
-- Reverte fn_trocar_viatura_avaria — decisão de design revista
-- ============================================================
-- A troca de viatura por avaria deixa de ser um caminho paralelo a partir
-- do ticket de Assistência (RPC fn_trocar_viatura_avaria, migration
-- 20260706120000). Decisão do dono do produto: troca/upgrade/downgrade
-- passam a ser SEMPRE feitos pelo contrato (ContratoForm.tsx), que já
-- tinha o fluxo completo de versionamento (criar_versao_contrato_renting +
-- ContratoNovaVersaoDialog pedindo motivo) — não fazia sentido duplicar
-- essa lógica com um caminho diferente vindo do ticket.
--
-- O gap real (motorista/viatura escapava aos triggers de sincronização
-- quando o titular do contrato é uma empresa-frota) já foi corrigido
-- separadamente pelos triggers com fallback contrato_condutores
-- (migration 20260706130000) — essa correção fica, é independente de
-- onde a troca é iniciada.
-- ============================================================

DROP FUNCTION IF EXISTS public.fn_trocar_viatura_avaria(uuid, uuid, text);
