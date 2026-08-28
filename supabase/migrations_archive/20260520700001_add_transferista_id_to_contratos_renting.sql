-- ============================================================
-- Adicionar transferista_id ao contrato_renting
-- ============================================================
-- O transferista é o colaborador interno (profiles) responsável pela
-- operação física da viatura no contrato — entrega e recolha.
--
-- Modelo: FK simples (um por contrato). O mesmo profile pode aparecer
-- em N contratos diferentes. Se o transferista mudar a meio (raro),
-- é actualizado por UPDATE.
--
-- Nullable em fase 1 — torna-se obrigatório por NOT NULL após o
-- backfill (quando todos os contratos existentes tiverem valor).
-- ============================================================

ALTER TABLE public.contratos_renting
  ADD COLUMN IF NOT EXISTS transferista_id uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.contratos_renting.transferista_id IS
  'Colaborador interno responsável pela entrega e recolha física da '
  'viatura. FK para profiles. Obrigatório no novo fluxo de criação '
  '(validado pelo schema Zod no client).';

CREATE INDEX IF NOT EXISTS idx_contratos_renting_transferista
  ON public.contratos_renting (transferista_id)
  WHERE deleted_at IS NULL;
