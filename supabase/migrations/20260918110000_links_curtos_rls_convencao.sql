-- `links_curtos` nasceu (20260918100000) só com políticas PERMISSIVE próprias,
-- e o CI apanhou-o: faltavam as duas RESTRICTIVE que este projecto exige a
-- qualquer tabela nova — rls_org_isolation e rls_deny_anon. Sem elas, a
-- isolação por organização dependia de as políticas permissivas estarem todas
-- certas; com elas, nenhuma política permissiva escrita no futuro consegue
-- alargar o acesso para lá da organização.
--
-- Isolação estrita, sem `is_decada_ousada_admin()`: é o padrão das 174
-- políticas normais (ver 20260914170000). Um link curto aponta para um
-- ficheiro de uma empresa e de mais nenhuma.

ALTER TABLE public.links_curtos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_deny_anon ON public.links_curtos;
-- O papel anónimo nunca lê esta tabela. Quem abre o link não é `anon` a fazer
-- SELECT: é a edge function link-curto, com a service role, a resolver o
-- código — e a service role ignora o RLS.
CREATE POLICY rls_deny_anon ON public.links_curtos
  AS RESTRICTIVE FOR ALL TO anon
  USING (false);

DROP POLICY IF EXISTS rls_org_isolation ON public.links_curtos;
CREATE POLICY rls_org_isolation ON public.links_curtos
  AS RESTRICTIVE FOR ALL TO public
  USING (org_id = get_current_org_id())
  WITH CHECK (org_id = get_current_org_id());
