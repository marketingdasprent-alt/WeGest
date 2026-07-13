-- ============================================================
-- Soft-delete migration: movimentos
-- ============================================================
-- Adiciona coluna deleted_at + índice parcial + filtra SELECT
-- para excluir registos apagados (excepto admins).
--
-- NÃO altera:
--   • Comportamento de DELETE (hard delete continua a funcionar)
--   • Políticas INSERT / UPDATE / DELETE existentes
--   • Triggers existentes (movimento_sync_viatura, etc.)
-- ============================================================

-- 1. Coluna deleted_at
ALTER TABLE public.movimentos
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. Índice parcial: só registos activos
CREATE INDEX IF NOT EXISTS idx_movimentos_not_deleted
  ON public.movimentos(deleted_at) WHERE deleted_at IS NULL;

-- 3. RLS: SELECT policy mais restritiva (filtra deleted_at)
--    Mantém todas as condições originais (org_id + permissão).
DROP POLICY IF EXISTS "mt_movimentos_select" ON public.movimentos;
CREATE POLICY "mt_movimentos_select" ON public.movimentos FOR SELECT TO authenticated
  USING (
    org_id = get_current_org_id()
    AND has_renting_movimentacoes_access()
    AND (deleted_at IS NULL OR public.is_current_user_admin())
  );
