-- ============================================================
-- RPC: get_assistentes_disponiveis()
-- ============================================================
-- Lista os candidatos a "assistente responsável" de um ticket: todos os
-- membros dos GRUPOS (cargos) que têm o recurso `assistencia_disponivel`
-- ativo na organização ativa. Devolve uma linha por (grupo, membro) para o
-- frontend agrupar por grupo.
--
-- SECURITY DEFINER porque a RLS de `user_organizacoes`/`profiles` só deixa
-- um utilizador ver o PRÓPRIO registo (um gestor não-admin não consegue
-- listar os colegas). A função é escopada a get_current_org_id() e só
-- devolve dados a quem trabalha com assistência (admin, ou uma das
-- permissões assistencia_tickets/criar/ver) — senão devolve 0 linhas.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_assistentes_disponiveis()
RETURNS TABLE (cargo_id uuid, cargo_nome text, user_id uuid, nome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id AS cargo_id, c.nome AS cargo_nome, uo.user_id, p.nome
  FROM public.cargo_permissoes cp
  JOIN public.recursos r
    ON r.id = cp.recurso_id AND r.nome = 'assistencia_disponivel'
  JOIN public.cargos c
    ON c.id = cp.cargo_id
  JOIN public.user_organizacoes uo
    ON uo.cargo_id = c.id AND uo.org_id = cp.org_id
  JOIN public.profiles p
    ON p.id = uo.user_id
  WHERE cp.org_id = public.get_current_org_id()
    AND cp.tem_acesso = true
    AND (
      public.is_current_user_admin()
      OR public.has_permission(auth.uid(), 'assistencia_tickets')
      OR public.has_permission(auth.uid(), 'assistencia_criar')
      OR public.has_permission(auth.uid(), 'assistencia_ver')
    )
  ORDER BY c.nome, p.nome;
$$;

GRANT EXECUTE ON FUNCTION public.get_assistentes_disponiveis() TO authenticated;
