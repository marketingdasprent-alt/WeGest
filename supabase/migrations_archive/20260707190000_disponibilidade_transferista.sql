-- ============================================================
-- Disponibilidade do transferista
-- ============================================================
-- Transferista é o colaborador interno (profiles) responsável pela
-- entrega/recolha física da viatura (contratos_renting.transferista_id,
-- migration 20260520700001). Este campo permite marcar/alternar se
-- está disponível para ser escalado numa entrega/recolha.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS disponivel_transferista boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.disponivel_transferista IS
  'Disponibilidade do colaborador para ser escalado como transferista '
  '(entrega/recolha de viaturas). Alterável manualmente pelo próprio ou admin.';
