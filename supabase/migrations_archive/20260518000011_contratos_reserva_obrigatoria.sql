-- ============================================================
-- Migration: contratos_renting — reserva_id passa a obrigatória
-- ============================================================
-- Mudança de modelo:
--   Antes: walk-in podia ter reserva_id NULL (contrato sem reserva).
--   Agora: TODOS os contratos vêm de uma reserva. Walk-in é gerido
--          criando uma reserva rápida primeiro (workflow do colaborador).
--
-- A tabela `contratos_renting` está vazia neste momento — sem
-- migração de dados necessária. Caso contrário, seria necessário
-- criar reservas retroactivas antes de aplicar NOT NULL.
-- ============================================================

-- 1. Tornar reserva_id NOT NULL
ALTER TABLE public.contratos_renting
  ALTER COLUMN reserva_id SET NOT NULL;

-- 2. Trocar política de delete da reserva — RESTRICT em vez de SET NULL
--    Razão: agora reserva_id não pode ficar NULL, e queremos impedir
--    eliminar reserva que tenha contrato (mantém histórico íntegro).
ALTER TABLE public.contratos_renting
  DROP CONSTRAINT IF EXISTS contratos_renting_reserva_id_fkey;

ALTER TABLE public.contratos_renting
  ADD CONSTRAINT contratos_renting_reserva_id_fkey
  FOREIGN KEY (reserva_id) REFERENCES public.reservas(id)
  ON DELETE RESTRICT;

-- 3. Actualizar comment para reflectir a nova semântica
COMMENT ON COLUMN public.contratos_renting.reserva_id IS
  'FK obrigatória à reserva de origem. Todo o contrato começa como reserva. '
  'UNIQUE — 1 reserva = no máximo 1 contrato. Walk-in: colaborador cria '
  'reserva rápida primeiro, depois converte. ON DELETE RESTRICT — impede '
  'eliminar reserva com contrato (manter histórico).';
