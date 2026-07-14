-- Portal do motorista: auto-selecionar a org onde o utilizador é motorista.
--
-- Contexto do problema:
--   Quando um utilizador pertence a várias organizações (ex.: é staff/admin
--   numa org e motorista noutra), a sua "org ativa" (user_org_ativa) pode não
--   ser a org onde existe o registo de motorista. A RLS de `motoristas_ativos`
--   inclui uma política RESTRICTIVE por org — `org_id = get_current_org_id()` —
--   que é combinada com AND com todas as outras. Assim, mesmo a política
--   "Motoristas podem ver seus próprios dados" (auth.uid() = user_id) deixa de
--   devolver linhas quando a org ativa é diferente da org do motorista. O painel
--   não encontra o motorista e cai no formulário de candidatura em branco.
--
-- Esta função devolve — ignorando a RLS (SECURITY DEFINER) — a org onde o
-- utilizador autenticado tem um registo de motorista ATIVO, para o cliente poder
-- alinhar a org ativa antes de carregar o painel do motorista.

CREATE OR REPLACE FUNCTION public.get_minha_org_motorista()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT org_id
  FROM public.motoristas_ativos
  WHERE user_id = auth.uid()
    AND status_ativo = true
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_minha_org_motorista() TO authenticated;
