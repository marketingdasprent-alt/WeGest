-- ti_tokens.ti_gestao não incluía is_decada_ousada_admin(), ao contrário da
-- política gémea em ti_tickets. Efeito real: um admin da Década Ousada cuja
-- linha em user_organizacoes tenha is_admin = false (mas com
-- profiles.is_admin = true — são colunas diferentes, e is_decada_ousada_admin()
-- lê a segunda enquanto is_current_user_admin() lê a primeira) via os tickets
-- e NÃO via o token. O botão "Pedidos de informática" do Dashboard precisa do
-- token, por isso falhava com "A organização ainda não tem link de pedidos de
-- informática". Reproduzido com joao.bahia@dasprent.pt: 5 tickets visíveis,
-- 0 tokens.
--
-- NÃO se acrescenta is_decada_ousada_admin() ao rls_org_isolation desta tabela
-- (ao contrário de ti_tickets, onde ver tickets de todas as orgs é o objetivo):
-- useTiLinkPublico faz .limit(1).maybeSingle() sem filtrar org, por isso passar
-- a ver as 5 linhas devolveria o link público de uma org à sorte. A isolação
-- por org fica estrita — uma linha, a da org actual.

DROP POLICY ti_gestao ON public.ti_tokens;

CREATE POLICY ti_gestao ON public.ti_tokens
  AS PERMISSIVE FOR ALL TO public
  USING (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'ti_tickets_gerir')
    OR is_decada_ousada_admin()
  );
