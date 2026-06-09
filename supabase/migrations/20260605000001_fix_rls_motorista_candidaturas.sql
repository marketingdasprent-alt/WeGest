-- ============================================================
-- Fix: rls_org_isolation bloqueia motoristas nas candidaturas
-- ============================================================
-- O problema: quando get_current_org_id() devolve NULL (se
-- user_org_ativa ainda não estava preenchida no momento do INSERT),
-- a linha fica com org_id = NULL. A política RESTRICTIVE usa
-- USING (org_id = get_current_org_id()), mas NULL = NULL é FALSE
-- em SQL → todos os SELECT/UPDATE ficam bloqueados silenciosamente.
--
-- Correção: adicionar OR user_id = auth.uid() ao USING, para que
-- o motorista consiga sempre aceder à sua própria candidatura.
-- O WITH CHECK mantém-se igual: não permite gravar org_id fora
-- da org activa.
--
-- Além disso, faz backfill dos org_id NULL existentes.
-- ============================================================

-- 1. Recriar a política RESTRICTIVE com o bypass user_id
DROP POLICY IF EXISTS rls_org_isolation ON public.motorista_candidaturas;
CREATE POLICY rls_org_isolation ON public.motorista_candidaturas
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    org_id = public.get_current_org_id()
    OR user_id = auth.uid()
  )
  WITH CHECK (
    org_id IS NULL OR org_id = public.get_current_org_id()
  );

-- 2. Backfill: preencher org_id NULL com o org do motorista
UPDATE public.motorista_candidaturas mc
SET org_id = (
  SELECT uoa.org_id
  FROM public.user_org_ativa uoa
  WHERE uoa.user_id = mc.user_id
  LIMIT 1
)
WHERE mc.org_id IS NULL;
