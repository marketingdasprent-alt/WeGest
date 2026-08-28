-- supabase/migrations/20260720130000_periodo_livre_resumo_semanal.sql
-- "Fechar Semana" passa a aceitar qualquer período (não só segunda-domingo).
-- Fechar o mesmo período duas vezes continua a fazer upsert (idempotente);
-- fechar dois períodos DIFERENTES da mesma viatura/motorista (ex: segunda-
-- quarta e depois quinta-domingo) agora cria duas linhas em vez de a segunda
-- apagar a primeira — a chave única passa a incluir semana_fim.

ALTER TABLE public.viatura_resumo_semanal
  DROP CONSTRAINT IF EXISTS viatura_resumo_semanal_unique;
ALTER TABLE public.viatura_resumo_semanal
  ADD CONSTRAINT viatura_resumo_semanal_unique UNIQUE (viatura_id, semana_inicio, semana_fim);

ALTER TABLE public.motorista_resumo_semanal
  DROP CONSTRAINT IF EXISTS motorista_resumo_semanal_unique;
ALTER TABLE public.motorista_resumo_semanal
  ADD CONSTRAINT motorista_resumo_semanal_unique UNIQUE (motorista_id, contrato_id, semana_inicio, semana_fim);
