-- ============================================================
-- Migration: contratos_renting — UNIQUE(reserva_id) condicional
-- ============================================================
-- A constraint UNIQUE actual em `reserva_id` conta soft-deleted,
-- impedindo recriar contrato para uma reserva mesmo depois do
-- contrato original ser eliminado.
--
-- Solução: trocar por partial unique index que SÓ se aplica a
-- contratos activos (deleted_at IS NULL). Soft-deleted ficam
-- "fora" do espaço único, libertando a reserva para novo contrato.
-- ============================================================

-- 1. Remover constraint UNIQUE simples (criada inline no CREATE TABLE)
ALTER TABLE public.contratos_renting
  DROP CONSTRAINT IF EXISTS contratos_renting_reserva_id_key;

-- 2. Criar partial unique index condicionado a contratos activos
CREATE UNIQUE INDEX IF NOT EXISTS uq_contratos_renting_reserva_id_active
  ON public.contratos_renting (reserva_id)
  WHERE deleted_at IS NULL;

COMMENT ON INDEX public.uq_contratos_renting_reserva_id_active IS
  'UNIQUE parcial: 1 reserva = no máximo 1 contrato ACTIVO. '
  'Soft-deleted não conta — permite recriar contrato após eliminar.';
