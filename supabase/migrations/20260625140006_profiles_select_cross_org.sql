-- Permite ver profiles de utilizadores que são membros da org ativa,
-- mesmo que profiles.org_id seja diferente (suporte multi-org).
DROP POLICY IF EXISTS "mt_profiles_select" ON public.profiles;

CREATE POLICY "mt_profiles_select" ON public.profiles
FOR SELECT USING (
  -- próprio perfil
  id = auth.uid()
  -- membros da org ativa (home-org match, comportamento original)
  OR (
    org_id = get_current_org_id()
    AND (is_current_user_admin() OR has_permission(auth.uid(), 'calendario_ver_gestores'))
  )
  -- membros de outra org que também pertencem à org ativa (multi-org)
  OR (
    EXISTS (
      SELECT 1 FROM public.user_organizacoes
      WHERE user_id = profiles.id
        AND org_id = get_current_org_id()
    )
    AND (is_current_user_admin() OR has_permission(auth.uid(), 'admin_utilizadores'))
  )
);