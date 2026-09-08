-- O Suporte TI é a equipa de suporte da plataforma: tem de ver os pedidos de
-- TODAS as empresas, tal como os admins da Década Ousada já viam. Até aqui só
-- is_decada_ousada_admin() atravessava a isolação por organização, por isso
-- quem estava no cargo Suporte TI sem ser admin (Thiago Sousa, Dinis Silva)
-- via apenas os pedidos da Década.
--
-- Porquê uma função própria e não simplesmente has_permission('ti_tickets_gerir')
-- nas políticas de isolação: essa permissão é atribuível por qualquer
-- organização aos seus próprios cargos. Se a PREMIUM RIDE criasse amanhã um
-- cargo com ela, passaria a ver os pedidos de todas as outras empresas. Ao
-- exigir também pertencer à Década Ousada, o alcance cross-org fica reservado
-- a quem faz suporte à plataforma; qualquer outra organização que atribua a
-- permissão continua a gerir só os pedidos dela.

CREATE OR REPLACE FUNCTION public.is_suporte_ti_decada()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_organizacoes uo
    JOIN public.cargo_permissoes cp ON cp.cargo_id = uo.cargo_id
    JOIN public.recursos r ON r.id = cp.recurso_id
    WHERE uo.user_id = auth.uid()
      AND uo.org_id = '11111111-1111-1111-1111-111111111111'
      AND r.nome = 'ti_tickets_gerir'
      AND cp.tem_acesso = true
  );
$$;

COMMENT ON FUNCTION public.is_suporte_ti_decada() IS
  'Pertence à Década Ousada E o cargo lá tem ti_tickets_gerir — a equipa de suporte da plataforma. Usada para atravessar a isolação por organização nas tabelas de pedidos de informática, sem dar esse alcance a cargos equivalentes noutras organizações.';

DROP POLICY rls_org_isolation ON public.ti_tickets;
CREATE POLICY rls_org_isolation ON public.ti_tickets
  AS RESTRICTIVE FOR ALL TO public
  USING (
    org_id = get_current_org_id()
    OR is_decada_ousada_admin()
    OR is_suporte_ti_decada()
  );

DROP POLICY rls_org_isolation ON public.ti_ticket_sugestoes;
CREATE POLICY rls_org_isolation ON public.ti_ticket_sugestoes
  AS RESTRICTIVE FOR ALL TO public
  USING (
    org_id = get_current_org_id()
    OR is_decada_ousada_admin()
    OR is_suporte_ti_decada()
  );

DROP POLICY rls_org_isolation ON public.ti_ticket_anexos;
CREATE POLICY rls_org_isolation ON public.ti_ticket_anexos
  AS RESTRICTIVE FOR ALL TO public
  USING (
    org_id = get_current_org_id()
    OR is_decada_ousada_admin()
    OR is_suporte_ti_decada()
  );
