-- ============================================================
-- Soft-delete migration: motorista_financeiro
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
ALTER TABLE public.motorista_financeiro
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. Índice parcial: só registos activos
CREATE INDEX IF NOT EXISTS idx_motorista_financeiro_not_deleted
  ON public.motorista_financeiro(deleted_at) WHERE deleted_at IS NULL;

-- 3. RLS: SELECT policy mais restritiva (filtra deleted_at)
--    Mantém todas as condições originais (org_id + permissões).
DROP POLICY IF EXISTS "mt_motorista_fin_select" ON public.motorista_financeiro;
CREATE POLICY "mt_motorista_fin_select" ON public.motorista_financeiro FOR SELECT TO authenticated
  USING (
    org_id = get_current_org_id()
    AND (
      is_current_user_admin()
      OR has_permission(auth.uid(), 'motoristas_gestao')
      OR has_permission(auth.uid(), 'assistencia_tickets')
    )
    AND (deleted_at IS NULL OR public.is_current_user_admin())
  );
