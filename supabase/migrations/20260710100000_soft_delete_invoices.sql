-- ============================================================
-- Soft-delete migration: invoices
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
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. Índice parcial: só registos activos
CREATE INDEX IF NOT EXISTS idx_invoices_not_deleted
  ON public.invoices(deleted_at) WHERE deleted_at IS NULL;

-- 3. RLS: SELECT policy mais restritiva (filtra deleted_at)
--    Mantém todas as condições originais (org_id + permissão).
DROP POLICY IF EXISTS "mt_invoices_select" ON public.invoices;
CREATE POLICY "mt_invoices_select" ON public.invoices
  FOR SELECT TO authenticated
  USING (
    org_id = get_current_org_id()
    AND has_renting_contratos_access()
    AND (deleted_at IS NULL OR public.is_current_user_admin())
  );
