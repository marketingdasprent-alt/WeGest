-- ============================================================
-- Soft-delete migration: motoristas
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
ALTER TABLE public.motoristas
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. Índice parcial: só registos activos (performance em queries comuns)
CREATE INDEX IF NOT EXISTS idx_motoristas_not_deleted
  ON public.motoristas(deleted_at) WHERE deleted_at IS NULL;

-- 3. RLS: SELECT policy mais restritiva (filtra deleted_at)
--    Mantém todas as condições originais (org_id + permissão).
DROP POLICY IF EXISTS "mt_motoristas_select" ON public.motoristas;
CREATE POLICY "mt_motoristas_select" ON public.motoristas FOR SELECT TO authenticated
  USING (
    org_id = get_current_org_id()
    AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'))
    AND (deleted_at IS NULL OR public.is_current_user_admin())
  );
