-- ============================================================
-- Fechar gaps de permissão em RLS (auditoria 2026-07-22)
-- ============================================================
-- Todas estas tabelas já tinham rls_org_isolation (RESTRICTIVE, org_id) —
-- portanto não havia fuga entre organizações. O problema era dentro da
-- própria org: a política PERMISSIVE efetiva não verificava nenhuma
-- permissão, pelo que qualquer utilizador autenticado da org (mesmo sem
-- nenhum grupo/permissão atribuída) conseguia escrever diretamente via API,
-- contornando o ecrã de permissões (cargo_permissoes). O frontend já exige
-- a permissão certa para mostrar estas ações — esta migration alinha o
-- backend com essa promessa.
--
-- cartoes_frota / dispositivos_obe: só tinham "org_id = ..." sem permissão
--   → agora exigem 'administrativo_cartoes' (ver para SELECT, editar para
--     INSERT/UPDATE/DELETE), o mesmo recurso já usado nas rotas
--     /administrativo/cartoes e /administrativo/obe.
-- reparacao_parcelas / marketing_assinaturas: já tinham uma policy "mt_*"
--   correta, mas políticas legadas com qual/with_check = true (ou
--   auth.uid() IS NOT NULL) continuavam ativas em paralelo e, por OR entre
--   permissive policies, anulavam a verificação da policy correta.
-- edp_transacoes / repsol_transacoes: mesma situação — "Admin access X" /
--   "Admin full access X" diziam admin no nome mas o qual era `true`.
-- motorista_custos_adicionais: só tinha "auth.role() = 'authenticated'",
--   sem qualquer verificação de permissão — alinhado com a tabela irmã
--   motorista_financeiro (can_view_financeiro()).
-- ============================================================

-- ---- cartoes_frota ----
DROP POLICY IF EXISTS "cartoes_frota_all" ON public.cartoes_frota;

CREATE POLICY cartoes_frota_select ON public.cartoes_frota
  FOR SELECT TO authenticated
  USING (is_current_user_admin() OR has_permission(auth.uid(), 'administrativo_cartoes'));

CREATE POLICY cartoes_frota_insert ON public.cartoes_frota
  FOR INSERT TO authenticated
  WITH CHECK (is_current_user_admin() OR has_permission(auth.uid(), 'administrativo_cartoes', 'editar'));

CREATE POLICY cartoes_frota_update ON public.cartoes_frota
  FOR UPDATE TO authenticated
  USING (is_current_user_admin() OR has_permission(auth.uid(), 'administrativo_cartoes', 'editar'))
  WITH CHECK (is_current_user_admin() OR has_permission(auth.uid(), 'administrativo_cartoes', 'editar'));

CREATE POLICY cartoes_frota_delete ON public.cartoes_frota
  FOR DELETE TO authenticated
  USING (is_current_user_admin() OR has_permission(auth.uid(), 'administrativo_cartoes', 'editar'));

-- ---- dispositivos_obe ----
DROP POLICY IF EXISTS "obe_all" ON public.dispositivos_obe;

CREATE POLICY dispositivos_obe_select ON public.dispositivos_obe
  FOR SELECT TO authenticated
  USING (is_current_user_admin() OR has_permission(auth.uid(), 'administrativo_cartoes'));

CREATE POLICY dispositivos_obe_insert ON public.dispositivos_obe
  FOR INSERT TO authenticated
  WITH CHECK (is_current_user_admin() OR has_permission(auth.uid(), 'administrativo_cartoes', 'editar'));

CREATE POLICY dispositivos_obe_update ON public.dispositivos_obe
  FOR UPDATE TO authenticated
  USING (is_current_user_admin() OR has_permission(auth.uid(), 'administrativo_cartoes', 'editar'))
  WITH CHECK (is_current_user_admin() OR has_permission(auth.uid(), 'administrativo_cartoes', 'editar'));

CREATE POLICY dispositivos_obe_delete ON public.dispositivos_obe
  FOR DELETE TO authenticated
  USING (is_current_user_admin() OR has_permission(auth.uid(), 'administrativo_cartoes', 'editar'));

-- ---- reparacao_parcelas: remover as policies legadas sem verificação ----
-- (as policies "mt_reparacao_parcelas_select/insert/update", com a
-- verificação correta de motoristas_gestao/assistencia_tickets, mantêm-se)
DROP POLICY IF EXISTS "Authenticated users can view parcelas" ON public.reparacao_parcelas;
DROP POLICY IF EXISTS "Authenticated users can insert parcelas" ON public.reparacao_parcelas;
DROP POLICY IF EXISTS "Authenticated users can update parcelas" ON public.reparacao_parcelas;
DROP POLICY IF EXISTS "Authenticated users can delete parcelas" ON public.reparacao_parcelas;

CREATE POLICY mt_reparacao_parcelas_delete ON public.reparacao_parcelas
  FOR DELETE TO authenticated
  USING (
    (org_id = get_current_org_id())
    AND (is_current_user_admin()
      OR has_permission(auth.uid(), 'motoristas_gestao')
      OR has_permission(auth.uid(), 'assistencia_tickets'))
  );

-- ---- marketing_assinaturas: remover legadas sem verificação de permissão ----
-- (a policy "mt_marketing_assinaturas_all", com org + marketing_ver, cobre
-- sozinha SELECT/INSERT/UPDATE/DELETE depois de removidas as outras)
DROP POLICY IF EXISTS "Utilizadores autenticados podem ver assinaturas" ON public.marketing_assinaturas;
DROP POLICY IF EXISTS "Utilizadores autenticados podem criar assinaturas" ON public.marketing_assinaturas;
DROP POLICY IF EXISTS "Utilizadores autenticados podem editar assinaturas" ON public.marketing_assinaturas;
DROP POLICY IF EXISTS "Utilizadores autenticados podem eliminar assinaturas" ON public.marketing_assinaturas;
DROP POLICY IF EXISTS "mt_marketing_assinaturas_select" ON public.marketing_assinaturas;

-- ---- motorista_custos_adicionais: sem verificação de permissão nenhuma ----
DROP POLICY IF EXISTS "Allow all authenticated users" ON public.motorista_custos_adicionais;

CREATE POLICY motorista_custos_adicionais_all ON public.motorista_custos_adicionais
  FOR ALL TO authenticated
  USING (can_view_financeiro())
  WITH CHECK (can_view_financeiro());

-- ---- edp_transacoes: "Admin access/full access" tinham qual = true ----
-- (a policy "mt_edp_transacoes_all", com org + can_view_financeiro(),
-- mantém-se e passa a ser a única a aplicar-se)
DROP POLICY IF EXISTS "Admin access EDP" ON public.edp_transacoes;
DROP POLICY IF EXISTS "Admin full access EDP" ON public.edp_transacoes;

-- ---- repsol_transacoes: mesma situação ----
DROP POLICY IF EXISTS "Admin access Repsol" ON public.repsol_transacoes;
DROP POLICY IF EXISTS "Admin full access Repsol" ON public.repsol_transacoes;
