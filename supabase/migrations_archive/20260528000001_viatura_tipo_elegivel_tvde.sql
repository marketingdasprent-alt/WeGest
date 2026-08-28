-- ============================================================
-- Elegibilidade TVDE ao nível do TIPO de viatura
-- ============================================================
-- O tipo de viatura passa a ter um flag `elegivel_tvde`. Quando
-- ligado, as viaturas desse tipo expõem no seu perfil a opção
-- "Elegível para TVDE?" (que escreve em viaturas.habilitada_tvde,
-- a papelada legal já existente — dístico, seguro, registo IMT).
--
-- Esta migration é IDEMPOTENTE.
-- ============================================================

ALTER TABLE public.viatura_tipos
  ADD COLUMN IF NOT EXISTS elegivel_tvde boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.viatura_tipos.elegivel_tvde IS
  'Tipo elegível para TVDE. Viaturas deste tipo podem ser marcadas como '
  'habilitadas para TVDE (viaturas.habilitada_tvde).';

-- Backfill: tipos cujo nome menciona "TVDE" ficam elegíveis, para manter
-- o comportamento anterior que era inferido pelo nome do tipo.
UPDATE public.viatura_tipos
  SET elegivel_tvde = true
  WHERE lower(nome) LIKE '%tvde%' AND elegivel_tvde = false;
