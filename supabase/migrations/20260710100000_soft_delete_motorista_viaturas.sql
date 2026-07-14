-- ============================================================
-- Soft-delete migration: motorista_viaturas
-- ============================================================
-- Adiciona coluna deleted_at + índice parcial + filtra SELECT
-- para excluir registos apagados (excepto admins).
--
-- NÃO altera:
--   • Comportamento de DELETE (hard delete continua a funcionar)
--   • Políticas INSERT / UPDATE existentes
--   • Triggers existentes
-- ============================================================

-- 1. Coluna deleted_at
ALTER TABLE public.motorista_viaturas
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. Índice parcial: só registos activos
CREATE INDEX IF NOT EXISTS idx_motorista_viaturas_not_deleted
  ON public.motorista_viaturas(deleted_at) WHERE deleted_at IS NULL;

-- 3. RLS: SELECT policy mais restritiva (filtra deleted_at)
--    Mantém todas as condições originais (org_id + permissão).
DROP POLICY IF EXISTS "mt_motorista_viaturas_select" ON public.motorista_viaturas;
CREATE POLICY "mt_motorista_viaturas_select" ON public.motorista_viaturas FOR SELECT TO authenticated
  USING (
    org_id = get_current_org_id()
    AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'))
    AND (deleted_at IS NULL OR public.is_current_user_admin())
  );
