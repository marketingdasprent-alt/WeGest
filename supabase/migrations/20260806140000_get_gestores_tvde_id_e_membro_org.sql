-- ============================================================
-- get_gestores_tvde: devolve id + nome, e abre o gate a qualquer membro da org
-- ============================================================
-- Sequela de 20260806100000. Esse fix criou o RPC e corrigiu UM dos ecrãs,
-- mas existiam TRÊS implementações independentes da mesma lista de "Gestor
-- TVDE" e o ecrã reportado pelo utilizador era outro:
--
--   1. src/components/motoristas/useGestoresTvde.ts  → o RPC (corrigido)
--   2. src/components/motoristas/tabs/MotoristaTabDados.tsx → query inline a
--      `profiles` (ficha do motorista — o ecrã que estava partido)
--   3. src/hooks/useGestoresTvde.ts → query a `profiles` (GestorSelect de
--      contratos/reservas — partido pela mesma razão, ainda sem queixa)
--
-- As duas cópias que leem `profiles` directamente ficam vazias para
-- não-admins: a policy `mt_profiles_select` só deixa ver a própria linha,
-- ou a org inteira com `is_current_user_admin()` / `calendario_ver_gestores`
-- / `admin_utilizadores`. A RLS FILTRA linhas em vez de dar erro, por isso o
-- sintoma é indistinguível de "não há gestores" — foi o que deixou o bug
-- sobreviver a um fix.
--
-- Esta migração prepara a convergência das três num só RPC:
--
-- a) Passa a devolver também o `id`. O GestorSelect de contratos/reservas
--    guarda `profiles.id` (contratos_renting.gestor_id / reservas.gestor_id),
--    por isso só com `nome` não era substituível. Obriga a DROP: o Postgres
--    não deixa mudar o tipo de retorno com CREATE OR REPLACE.
--    NÃO devolve `email` de propósito — o único consumidor que o pedia nunca
--    o mostrava no ecrã.
--
-- b) O gate passa a ser "pertencer à organização activa", em vez da lista de
--    permissões (admin / motoristas_ver / calendario_ver_gestores). Decisão do
--    dono do produto: são apenas nomes de colegas internos da própria org, e a
--    lista de permissões era ela própria uma fonte de bugs — bastava um cargo
--    novo sem a permissão certa para o selector voltar a aparecer vazio, sem
--    qualquer erro visível. O isolamento multi-tenant mantém-se intacto:
--    `uo.org_id = get_current_org_id()` continua a limitar o resultado à org
--    activa, e o EXISTS garante que quem chama é mesmo membro dessa org.
--
-- Continua SECURITY DEFINER (user_organizacoes só é legível pelo próprio ou
-- por admin) e nenhuma política de RLS é alargada.
--
-- Critério de cargo: nome contém "gestor" E "tvde" — apanha "Gestor TVDE" e
-- "Supervisor Gestor TVDE". A fonte é `cargos` via `user_organizacoes` e NÃO
-- o texto denormalizado `profiles.cargo`: o cargo é POR ORGANIZAÇÃO, mas
-- `profiles.cargo` é um único campo global — para quem pertence a várias orgs
-- está errado por construção (verificado em produção: a mesma conta é
-- "Gestor TVDE" numa org e "Administrador" noutra). Escopado à Década Ousada
-- as duas vias devolvem exactamente o mesmo conjunto, por isso a convergência
-- não faz ninguém desaparecer da lista.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_gestores_tvde();

CREATE FUNCTION public.get_gestores_tvde()
RETURNS TABLE (id uuid, nome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.id, p.nome
  FROM public.user_organizacoes uo
  JOIN public.cargos c   ON c.id = uo.cargo_id
  JOIN public.profiles p ON p.id = uo.user_id
  WHERE uo.org_id = public.get_current_org_id()
    AND c.nome ILIKE '%gestor%'
    AND c.nome ILIKE '%tvde%'
    AND p.nome IS NOT NULL
    AND btrim(p.nome) <> ''
    -- Quem chama tem de ser membro da org activa (o gate).
    AND EXISTS (
      SELECT 1
      FROM public.user_organizacoes membro
      WHERE membro.user_id = auth.uid()
        AND membro.org_id  = public.get_current_org_id()
    )
  ORDER BY p.nome;
$$;

-- O DROP acima leva os GRANTs com ele — tem de ser reposto.
GRANT EXECUTE ON FUNCTION public.get_gestores_tvde() TO authenticated;

COMMENT ON FUNCTION public.get_gestores_tvde() IS
  'id + nome dos gestores TVDE da org activa, para os selectores de "Gestor" '
  '(ficha do motorista, diálogo de novo motorista, contratos/reservas). '
  'SECURITY DEFINER porque user_organizacoes só é legível pelo próprio ou por '
  'admin; o gate é pertencer à org activa. Fonte do cargo é `cargos` via '
  '`user_organizacoes` (por-org) e não `profiles.cargo` (texto global).';

NOTIFY pgrst, 'reload schema';
