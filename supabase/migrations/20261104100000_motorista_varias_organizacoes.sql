-- Um motorista pode trabalhar para várias organizações com o mesmo login.
--
-- O índice único era (user_id) em toda a base: o mesmo login não podia ter ficha
-- na Década e na Premium Ride. Passa a ser único por organização. A segurança não
-- muda: o isolamento por organização continua a filtrar tudo pela org ativa.

DROP INDEX IF EXISTS public.uq_motoristas_ativos_user_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_motoristas_ativos_org_user
  ON public.motoristas_ativos (org_id, user_id)
  WHERE user_id IS NOT NULL;

-- As organizações onde o login tem ficha de motorista, as ativas primeiro.
-- Inclui fichas inativas: quem mudou de empresa continua a ver o histórico
-- (contrato, resumos, dívidas) da anterior. SECURITY DEFINER porque a RLS de
-- motoristas_ativos só deixa ler a ficha da org ativa, e o portal precisa de
-- saber todas para oferecer a troca.
CREATE OR REPLACE FUNCTION public.minhas_orgs_motorista()
RETURNS TABLE(org_id uuid, org_nome text, ficha_ativa boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT m.org_id, o.nome, m.status_ativo
    FROM public.motoristas_ativos m
    JOIN public.organizacoes o ON o.id = m.org_id
   WHERE m.user_id = auth.uid()
     AND o.ativa = true
   ORDER BY m.status_ativo DESC, m.updated_at DESC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.minhas_orgs_motorista() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.minhas_orgs_motorista() TO authenticated, service_role;

COMMENT ON FUNCTION public.minhas_orgs_motorista() IS
  'Organizações em que o utilizador autenticado tem ficha de motorista (ativas primeiro). Alimenta o seletor de organização do portal do motorista.';

NOTIFY pgrst, 'reload schema';
