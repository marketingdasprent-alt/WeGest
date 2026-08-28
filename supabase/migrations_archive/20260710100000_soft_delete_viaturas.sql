-- ============================================================
-- Soft-delete migration: viaturas
-- ============================================================
-- Adiciona coluna deleted_at + índice parcial + filtra SELECT
-- para excluir registos apagados (excepto admins).
--
-- NÃO altera:
--   • Comportamento de DELETE (hard delete continua a funcionar)
--   • Políticas INSERT / UPDATE / DELETE existentes
--   • Triggers existentes
-- ============================================================

-- 1. Coluna deleted_at
ALTER TABLE public.viaturas
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. Índice parcial: só registos activos
CREATE INDEX IF NOT EXISTS idx_viaturas_not_deleted
  ON public.viaturas(deleted_at) WHERE deleted_at IS NULL;

-- 3. RLS: SELECT policy mais restritiva (filtra deleted_at)
--    Mantém todas as condições originais (org_id + permissão).
DROP POLICY IF EXISTS "mt_viaturas_select" ON public.viaturas;
CREATE POLICY "mt_viaturas_select" ON public.viaturas FOR SELECT TO authenticated
  USING (
    org_id = get_current_org_id()
    AND (is_current_user_admin() OR has_permission(auth.uid(), 'viaturas_ver'))
    AND (deleted_at IS NULL OR public.is_current_user_admin())
  );
