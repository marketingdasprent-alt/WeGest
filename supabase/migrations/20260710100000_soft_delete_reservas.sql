-- ============================================================
-- Soft-delete migration: reservas
-- ============================================================
-- Adiciona coluna deleted_at + índice parcial.
--
-- NOTA: As policies SELECT e UPDATE de reservas JÁ referenciam
-- deleted_at (migration 20260615000002_privacidade_por_gestor.sql),
-- mas a coluna ainda não existia. Esta migration cria a coluna,
-- tornando essas policies funcionais.
--
-- NÃO altera:
--   • Comportamento de DELETE (hard delete continua a funcionar)
--   • Políticas existentes (SELECT e UPDATE já filtram deleted_at)
--   • Triggers existentes
-- ============================================================

-- 1. Coluna deleted_at
ALTER TABLE public.reservas
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. Índice parcial: só registos activos
CREATE INDEX IF NOT EXISTS idx_reservas_not_deleted
  ON public.reservas(deleted_at) WHERE deleted_at IS NULL;
