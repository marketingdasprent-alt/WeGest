-- ============================================================
-- Pedidos de TI: um sítio só para todas as organizações
-- ============================================================
-- Quem faz suporte informático trata das empresas todas, mas a lista estava
-- fechada à organização activa: era preciso trocar de empresa para ver os
-- pedidos de cada uma, e um pedido numa empresa onde ninguém entrasse ficava
-- a apodrecer sem ninguém dar por ele.
--
-- A abertura é DELIBERADAMENTE estreita. `is_decada_ousada_admin()` já existe
-- e já é o que decide quem gere `organizacoes` e `user_organizacoes` — é o
-- papel de "equipa da plataforma" que este repositório já tem. Usar aqui
-- `is_current_user_admin()` seria outra coisa completamente diferente: daria
-- aos admins de CADA cliente os pedidos de TODOS os outros clientes, com
-- descrições de problemas internos, nomes e emails lá dentro.

-- ── Leitura entre organizações ────────────────────────────────
-- A restritiva continua a existir e continua a ser a regra para toda a gente;
-- só ganha a excepção da equipa da plataforma. Sem WITH CHECK, tal como estava:
-- numa política FOR ALL o Postgres usa o USING também para a inserção, e mudar
-- isso agora alterava em silêncio quem pode criar pedidos.
DROP POLICY IF EXISTS rls_org_isolation ON public.ti_tickets;
CREATE POLICY rls_org_isolation ON public.ti_tickets AS RESTRICTIVE
  USING (org_id = get_current_org_id() OR is_decada_ousada_admin());

DROP POLICY IF EXISTS rls_org_isolation ON public.ti_ticket_sugestoes;
CREATE POLICY rls_org_isolation ON public.ti_ticket_sugestoes AS RESTRICTIVE
  USING (org_id = get_current_org_id() OR is_decada_ousada_admin());

-- A permissiva também precisa da excepção: `is_current_user_admin()` e
-- `has_permission()` respondem sempre sobre a organização ACTIVA. Sem isto,
-- alguém do suporte com a sessão aberta noutra empresa passava na restritiva e
-- ficava barrado aqui — via zero pedidos e parecia que a lista estava vazia.
DROP POLICY IF EXISTS ti_gestao ON public.ti_tickets;
CREATE POLICY ti_gestao ON public.ti_tickets FOR ALL
  USING (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'ti_tickets_gerir')
    OR is_decada_ousada_admin()
  );

DROP POLICY IF EXISTS ti_gestao ON public.ti_ticket_sugestoes;
CREATE POLICY ti_gestao ON public.ti_ticket_sugestoes FOR ALL
  USING (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'ti_tickets_gerir')
    OR is_decada_ousada_admin()
  );

-- `ti_tokens` fica como está: o link público continua a ser por empresa, e cada
-- pedido continua a nascer com o org_id de quem o abriu. É esse org_id que
-- passa a aparecer como etiqueta na lista.

-- ── Quem respondeu e quem resolveu ────────────────────────────
-- Nome em texto, não só o uuid, pelo mesmo motivo que `ti_tickets.autor_nome`
-- já é texto: a RLS de `profiles` é por organização (mt_profiles_select), e
-- portanto ler o nome de quem resolveu falharia assim que a lista atravessasse
-- empresas — exactamente o caso que esta migração abre. O uuid `criado_por`
-- continua lá para quando for preciso saber a conta.
ALTER TABLE public.ti_ticket_sugestoes
  ADD COLUMN IF NOT EXISTS criado_por_nome text;

ALTER TABLE public.ti_tickets
  ADD COLUMN IF NOT EXISTS resolvido_por_nome text,
  ADD COLUMN IF NOT EXISTS resolvido_em       timestamptz;

COMMENT ON COLUMN public.ti_ticket_sugestoes.criado_por_nome IS
  'Nome de quem escreveu a sugestão, guardado em texto porque a RLS de profiles '
  'é por organização e a lista de pedidos atravessa organizações.';

COMMENT ON COLUMN public.ti_tickets.resolvido_por_nome IS
  'Quem deu o pedido por resolvido: o admin que carregou em "resolvido", ou o '
  'autor da sugestão que o próprio requerente aceitou. Nulo enquanto aberto.';
