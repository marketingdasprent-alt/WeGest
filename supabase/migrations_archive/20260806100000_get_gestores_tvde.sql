-- ============================================================
-- Gestores TVDE da org — sem alargar RLS
-- ============================================================
-- O selector "Gestor" da ficha do motorista lia `user_organizacoes`
-- directamente. Essa tabela só tem duas políticas de SELECT:
--
--   "Users podem ver as suas associacoes"  →  user_id = auth.uid()
--   "Admins podem gerir ..."               →  org + is_current_user_admin()
--
-- Ou seja, quem não é administrador recebe apenas a SUA linha. O ecrã
-- filtrava-a por cargo 'Gestor TVDE' e ficava com uma lista vazia — mesmo
-- para cargos com `motoristas_editar`, que têm precisamente a obrigação de
-- preencher este campo. `profiles` impunha a mesma barreira logo a seguir
-- (exige admin ou `calendario_ver_gestores`).
--
-- Resolve-se como noutros pontos do projecto (get_assistentes_disponiveis):
-- uma função SECURITY DEFINER que devolve APENAS nomes e faz o gate aqui
-- dentro. Nenhuma política é alargada e a tabela continua fechada.
--
-- O critério de cargo replica o que o frontend fazia (nome contém "gestor"
-- E "tvde"), para apanhar também "Supervisor Gestor TVDE".
CREATE OR REPLACE FUNCTION public.get_gestores_tvde()
RETURNS TABLE (nome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.nome
  FROM public.user_organizacoes uo
  JOIN public.cargos c   ON c.id = uo.cargo_id
  JOIN public.profiles p ON p.id = uo.user_id
  WHERE uo.org_id = public.get_current_org_id()
    AND c.nome ILIKE '%gestor%'
    AND c.nome ILIKE '%tvde%'
    AND p.nome IS NOT NULL
    AND btrim(p.nome) <> ''
    AND (
      public.is_current_user_admin()
      OR public.has_permission(auth.uid(), 'motoristas_ver')
      OR public.has_permission(auth.uid(), 'calendario_ver_gestores')
    )
  ORDER BY p.nome;
$$;

GRANT EXECUTE ON FUNCTION public.get_gestores_tvde() TO authenticated;

COMMENT ON FUNCTION public.get_gestores_tvde() IS
  'Nomes dos gestores TVDE da org activa, para o selector "Gestor" da ficha do motorista. SECURITY DEFINER porque user_organizacoes só é legível pelo próprio ou por admin; o gate (admin, motoristas_ver ou calendario_ver_gestores) é feito dentro da função.';

NOTIFY pgrst, 'reload schema';
