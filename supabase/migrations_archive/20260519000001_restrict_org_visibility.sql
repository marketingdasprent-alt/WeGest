-- ============================================================
-- Restringir visibilidade das organizações
-- Somente admins da Década Ousada (org matriz) podem ver/gerir
-- TODAS as organizações. Outros admins vêem apenas a sua.
-- ============================================================

-- ID da organização matriz (Década Ousada)
-- Usamos uma função helper para manter o ID centralizado
CREATE OR REPLACE FUNCTION public.is_decada_ousada_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_organizacoes uo
    JOIN public.profiles p ON p.id = uo.user_id
    WHERE uo.user_id = auth.uid()
      AND uo.org_id = '11111111-1111-1111-1111-111111111111'
      AND p.is_admin = true
  );
$$;

-- ============================================================
-- Atualizar policies da tabela organizacoes
-- ============================================================

-- Remover a policy antiga que permite qualquer admin gerir orgs
DROP POLICY IF EXISTS "Admins podem gerir organizacoes" ON public.organizacoes;

-- Nova policy: somente admins da Década Ousada podem gerir (INSERT/UPDATE/DELETE) todas as orgs
CREATE POLICY "Decada Ousada admins podem gerir organizacoes"
  ON public.organizacoes FOR ALL TO authenticated
  USING (is_decada_ousada_admin())
  WITH CHECK (is_decada_ousada_admin());

-- A policy existente "Users podem ver orgs a que pertencem" já garante
-- que cada user só vê as orgs a que pertence (via user_organizacoes).
-- Não é preciso alterar.

-- ============================================================
-- Atualizar policies da tabela user_organizacoes
-- ============================================================

-- Remover a policy antiga que permite qualquer admin gerir associações
DROP POLICY IF EXISTS "Admins podem gerir user_organizacoes" ON public.user_organizacoes;

-- Nova policy: somente admins da Década Ousada podem gerir associações de todas as orgs
CREATE POLICY "Decada Ousada admins podem gerir user_organizacoes"
  ON public.user_organizacoes FOR ALL TO authenticated
  USING (is_decada_ousada_admin())
  WITH CHECK (is_decada_ousada_admin());

-- Admins de outras orgs podem gerir apenas associações da sua própria org
CREATE POLICY "Admins podem gerir user_organizacoes da sua org"
  ON public.user_organizacoes FOR ALL TO authenticated
  USING (
    org_id = get_current_org_id()
    AND is_current_user_admin()
  )
  WITH CHECK (
    org_id = get_current_org_id()
    AND is_current_user_admin()
  );
