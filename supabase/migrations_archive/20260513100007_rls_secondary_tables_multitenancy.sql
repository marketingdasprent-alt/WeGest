-- ============================================================
-- FASE COMPLEMENTAR: RLS multi-tenant para tabelas secundárias
-- ============================================================
-- Tabelas que já tinham policies mas sem filtro org_id.
-- Estratégia: DROP old policy + CREATE new com org_id filter.
-- ============================================================

-- ==================== CONTRATOS SUB-TABELAS ====================
-- contratos_reimpressoes
DROP POLICY IF EXISTS "Ver histórico de reimpressões" ON public.contratos_reimpressoes;
DROP POLICY IF EXISTS "Inserir reimpressões" ON public.contratos_reimpressoes;

CREATE POLICY "mt_contratos_reimp_select" ON public.contratos_reimpressoes FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_contratos')));
CREATE POLICY "mt_contratos_reimp_insert" ON public.contratos_reimpressoes FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_contratos')));

-- contratos_edicoes
DROP POLICY IF EXISTS "Ver histórico de edições" ON public.contratos_edicoes;
DROP POLICY IF EXISTS "Inserir edições" ON public.contratos_edicoes;

CREATE POLICY "mt_contratos_edicoes_select" ON public.contratos_edicoes FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_contratos')));
CREATE POLICY "mt_contratos_edicoes_insert" ON public.contratos_edicoes FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_contratos')));

-- contrato_media
DROP POLICY IF EXISTS "auth_select_contrato_media" ON public.contrato_media;
DROP POLICY IF EXISTS "auth_insert_contrato_media" ON public.contrato_media;
DROP POLICY IF EXISTS "auth_delete_contrato_media" ON public.contrato_media;

CREATE POLICY "mt_contrato_media_select" ON public.contrato_media FOR SELECT TO authenticated
  USING (org_id = get_current_org_id());
CREATE POLICY "mt_contrato_media_insert" ON public.contrato_media FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id());
CREATE POLICY "mt_contrato_media_delete" ON public.contrato_media FOR DELETE TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin());

-- ==================== VIATURA SUB-TABELAS ====================
-- viatura_reservas
DROP POLICY IF EXISTS "Permissão para ver viatura_reservas" ON public.viatura_reservas;
DROP POLICY IF EXISTS "Permissão para criar viatura_reservas" ON public.viatura_reservas;
DROP POLICY IF EXISTS "Permissão para editar viatura_reservas" ON public.viatura_reservas;
DROP POLICY IF EXISTS "Permissão para deletar viatura_reservas" ON public.viatura_reservas;

CREATE POLICY "mt_viatura_reservas_select" ON public.viatura_reservas FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao')));
CREATE POLICY "mt_viatura_reservas_insert" ON public.viatura_reservas FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao')));
CREATE POLICY "mt_viatura_reservas_update" ON public.viatura_reservas FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao')));
CREATE POLICY "mt_viatura_reservas_delete" ON public.viatura_reservas FOR DELETE TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin());

-- viatura_dano_fotos
DROP POLICY IF EXISTS "Permissão para ver fotos de danos" ON public.viatura_dano_fotos;
DROP POLICY IF EXISTS "Permissão para criar fotos de danos" ON public.viatura_dano_fotos;
DROP POLICY IF EXISTS "Permissão para deletar fotos de danos" ON public.viatura_dano_fotos;
DROP POLICY IF EXISTS "Motoristas podem ver fotos dos seus danos" ON public.viatura_dano_fotos;

CREATE POLICY "mt_viatura_dano_fotos_select" ON public.viatura_dano_fotos FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'viaturas_ver')
    OR has_permission(auth.uid(), 'motoristas_gestao')
  ));
CREATE POLICY "mt_viatura_dano_fotos_insert" ON public.viatura_dano_fotos FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() AND (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'viaturas_criar')
    OR has_permission(auth.uid(), 'motoristas_gestao')
  ));
CREATE POLICY "mt_viatura_dano_fotos_delete" ON public.viatura_dano_fotos FOR DELETE TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin());

-- viatura_proprietarios (sem policies antes — adicionar)
ALTER TABLE public.viatura_proprietarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mt_viatura_prop_select" ON public.viatura_proprietarios FOR SELECT TO authenticated
  USING (org_id = get_current_org_id());
CREATE POLICY "mt_viatura_prop_all" ON public.viatura_proprietarios FOR ALL TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin())
  WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());

-- reparacao_parcelas (sem policies antes — adicionar)
ALTER TABLE public.reparacao_parcelas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mt_reparacao_parcelas_select" ON public.reparacao_parcelas FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'motoristas_gestao')
    OR has_permission(auth.uid(), 'assistencia_tickets')
  ));
CREATE POLICY "mt_reparacao_parcelas_insert" ON public.reparacao_parcelas FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() AND (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'motoristas_gestao')
    OR has_permission(auth.uid(), 'assistencia_tickets')
  ));
CREATE POLICY "mt_reparacao_parcelas_update" ON public.reparacao_parcelas FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'motoristas_gestao')
    OR has_permission(auth.uid(), 'assistencia_tickets')
  ));

-- ==================== ASSISTÊNCIA SUB-TABELAS ====================
-- assistencia_categorias
DROP POLICY IF EXISTS "Todos podem ver categorias ativas" ON public.assistencia_categorias;
DROP POLICY IF EXISTS "Admins podem gerir categorias" ON public.assistencia_categorias;

CREATE POLICY "mt_assist_cat_select" ON public.assistencia_categorias FOR SELECT TO authenticated
  USING (org_id = get_current_org_id());
CREATE POLICY "mt_assist_cat_all" ON public.assistencia_categorias FOR ALL TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin())
  WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());

-- assistencia_mensagens
DROP POLICY IF EXISTS "Acesso abrangente para ver mensagens" ON public.assistencia_mensagens;
DROP POLICY IF EXISTS "Acesso abrangente para criar mensagens" ON public.assistencia_mensagens;
DROP POLICY IF EXISTS "Ver mensagens do ticket" ON public.assistencia_mensagens;
DROP POLICY IF EXISTS "Criar mensagens no ticket" ON public.assistencia_mensagens;

CREATE POLICY "mt_assist_msg_select" ON public.assistencia_mensagens FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'assistencia_tickets')
    OR EXISTS (
      SELECT 1 FROM public.assistencia_tickets t
      WHERE t.id = ticket_id AND (t.criado_por = auth.uid() OR t.atribuido_a = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.assistencia_ticket_acessos a
      WHERE a.ticket_id = public.assistencia_mensagens.ticket_id AND a.profile_id = auth.uid()
    )
  ));
CREATE POLICY "mt_assist_msg_insert" ON public.assistencia_mensagens FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id());

-- assistencia_anexos
DROP POLICY IF EXISTS "Acesso abrangente para ver anexos" ON public.assistencia_anexos;
DROP POLICY IF EXISTS "Acesso abrangente para criar anexos" ON public.assistencia_anexos;
DROP POLICY IF EXISTS "Ver anexos do ticket" ON public.assistencia_anexos;
DROP POLICY IF EXISTS "Criar anexos no ticket" ON public.assistencia_anexos;

CREATE POLICY "mt_assist_anexos_select" ON public.assistencia_anexos FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'assistencia_tickets')
    OR EXISTS (
      SELECT 1 FROM public.assistencia_tickets t
      WHERE t.id = ticket_id AND (t.criado_por = auth.uid() OR t.atribuido_a = auth.uid())
    )
  ));
CREATE POLICY "mt_assist_anexos_insert" ON public.assistencia_anexos FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id());

-- assistencia_ticket_acessos
DROP POLICY IF EXISTS "Acesso próprio aos registos de acesso" ON public.assistencia_ticket_acessos;
DROP POLICY IF EXISTS "Admins gerem acessos" ON public.assistencia_ticket_acessos;

CREATE POLICY "mt_assist_acessos_select" ON public.assistencia_ticket_acessos FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (profile_id = auth.uid() OR is_current_user_admin()));
CREATE POLICY "mt_assist_acessos_all" ON public.assistencia_ticket_acessos FOR ALL TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin())
  WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());

-- ==================== MARKETING ====================
DROP POLICY IF EXISTS "Utilizadores autenticados podem ver listas" ON public.marketing_listas;
DROP POLICY IF EXISTS "Utilizadores autenticados podem criar listas" ON public.marketing_listas;
DROP POLICY IF EXISTS "Utilizadores autenticados podem editar listas" ON public.marketing_listas;
DROP POLICY IF EXISTS "Utilizadores autenticados podem eliminar listas" ON public.marketing_listas;

CREATE POLICY "mt_marketing_listas_select" ON public.marketing_listas FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'marketing_ver')));
CREATE POLICY "mt_marketing_listas_insert" ON public.marketing_listas FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'marketing_ver')));
CREATE POLICY "mt_marketing_listas_update" ON public.marketing_listas FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'marketing_ver')));
CREATE POLICY "mt_marketing_listas_delete" ON public.marketing_listas FOR DELETE TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin());

DROP POLICY IF EXISTS "Utilizadores autenticados podem ver contactos" ON public.marketing_contactos;
DROP POLICY IF EXISTS "Utilizadores autenticados podem criar contactos" ON public.marketing_contactos;
DROP POLICY IF EXISTS "Utilizadores autenticados podem editar contactos" ON public.marketing_contactos;
DROP POLICY IF EXISTS "Utilizadores autenticados podem eliminar contactos" ON public.marketing_contactos;

CREATE POLICY "mt_marketing_contactos_select" ON public.marketing_contactos FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'marketing_ver')));
CREATE POLICY "mt_marketing_contactos_insert" ON public.marketing_contactos FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'marketing_ver')));
CREATE POLICY "mt_marketing_contactos_update" ON public.marketing_contactos FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'marketing_ver')));
CREATE POLICY "mt_marketing_contactos_delete" ON public.marketing_contactos FOR DELETE TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin());

DROP POLICY IF EXISTS "Utilizadores autenticados podem ver campanhas" ON public.marketing_campanhas;
DROP POLICY IF EXISTS "Utilizadores autenticados podem criar campanhas" ON public.marketing_campanhas;
DROP POLICY IF EXISTS "Utilizadores autenticados podem editar campanhas" ON public.marketing_campanhas;
DROP POLICY IF EXISTS "Utilizadores autenticados podem eliminar campanhas" ON public.marketing_campanhas;

CREATE POLICY "mt_marketing_campanhas_select" ON public.marketing_campanhas FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'marketing_ver')));
CREATE POLICY "mt_marketing_campanhas_insert" ON public.marketing_campanhas FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'marketing_ver')));
CREATE POLICY "mt_marketing_campanhas_update" ON public.marketing_campanhas FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'marketing_ver')));
CREATE POLICY "mt_marketing_campanhas_delete" ON public.marketing_campanhas FOR DELETE TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin());

-- marketing_assinaturas
ALTER TABLE public.marketing_assinaturas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mt_marketing_assinaturas_select" ON public.marketing_assinaturas FOR SELECT TO authenticated
  USING (org_id = get_current_org_id());
CREATE POLICY "mt_marketing_assinaturas_all" ON public.marketing_assinaturas FOR ALL TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'marketing_ver')))
  WITH CHECK (org_id = get_current_org_id());

-- marketing_envios
ALTER TABLE public.marketing_envios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mt_marketing_envios_select" ON public.marketing_envios FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'marketing_ver')));
CREATE POLICY "mt_marketing_envios_insert" ON public.marketing_envios FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id());

-- marketing_envio_detalhes
ALTER TABLE public.marketing_envio_detalhes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mt_marketing_envio_det_select" ON public.marketing_envio_detalhes FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'marketing_ver')));

-- email_sends
DROP POLICY IF EXISTS "Authenticated users can view email_sends" ON public.email_sends;
DROP POLICY IF EXISTS "Service role can insert email_sends" ON public.email_sends;
DROP POLICY IF EXISTS "Service role can update email_sends" ON public.email_sends;

CREATE POLICY "mt_email_sends_select" ON public.email_sends FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin());
CREATE POLICY "mt_email_sends_insert" ON public.email_sends FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id());
CREATE POLICY "mt_email_sends_update" ON public.email_sends FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id());

-- ==================== CALENDÁRIO SUB-TABELAS ====================
ALTER TABLE public.calendario_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mt_calendario_config_select" ON public.calendario_config FOR SELECT TO authenticated
  USING (org_id = get_current_org_id());
CREATE POLICY "mt_calendario_config_all" ON public.calendario_config FOR ALL TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin())
  WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());

ALTER TABLE public.calendario_eventos_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mt_calendario_hist_select" ON public.calendario_eventos_historico FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'calendario_ver')));
CREATE POLICY "mt_calendario_hist_insert" ON public.calendario_eventos_historico FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id());

-- ==================== INTEGRAÇÕES - plataformas_configuracao ====================
-- (tabela renomeada de bolt_configuracao para plataformas_configuracao)
DROP POLICY IF EXISTS "Admins podem gerir configuração plataformas" ON public.plataformas_configuracao;
DROP POLICY IF EXISTS "Admins podem gerir bolt_configuracao" ON public.plataformas_configuracao;
ALTER TABLE public.plataformas_configuracao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mt_plataformas_config_all" ON public.plataformas_configuracao FOR ALL TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin())
  WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());

-- bolt_viagens
ALTER TABLE public.bolt_viagens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mt_bolt_viagens_select" ON public.bolt_viagens FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao')));
CREATE POLICY "mt_bolt_viagens_insert" ON public.bolt_viagens FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id());

-- bolt_mapeamento_motoristas
ALTER TABLE public.bolt_mapeamento_motoristas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mt_bolt_map_all" ON public.bolt_mapeamento_motoristas FOR ALL TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin())
  WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());

-- bolt_sync_logs
ALTER TABLE public.bolt_sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mt_bolt_sync_select" ON public.bolt_sync_logs FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin());
CREATE POLICY "mt_bolt_sync_insert" ON public.bolt_sync_logs FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id());

-- bolt_drivers
DROP POLICY IF EXISTS "Admins podem ver motoristas Bolt" ON public.bolt_drivers;
DROP POLICY IF EXISTS "Admins podem gerir motoristas Bolt" ON public.bolt_drivers;

CREATE POLICY "mt_bolt_drivers_select" ON public.bolt_drivers FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin());
CREATE POLICY "mt_bolt_drivers_all" ON public.bolt_drivers FOR ALL TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin())
  WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());

-- bolt_vehicles
DROP POLICY IF EXISTS "Admins podem ver veículos Bolt" ON public.bolt_vehicles;
DROP POLICY IF EXISTS "Admins podem gerir veículos Bolt" ON public.bolt_vehicles;

CREATE POLICY "mt_bolt_vehicles_select" ON public.bolt_vehicles FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin());
CREATE POLICY "mt_bolt_vehicles_all" ON public.bolt_vehicles FOR ALL TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin())
  WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());

-- bolt_resumos_semanais
DROP POLICY IF EXISTS "Admins can manage bolt_resumos_semanais" ON public.bolt_resumos_semanais;

CREATE POLICY "mt_bolt_resumos_all" ON public.bolt_resumos_semanais FOR ALL TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin())
  WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());

-- ==================== INTEGRAÇÕES UBER ====================
ALTER TABLE public.uber_viagens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mt_uber_viagens_select" ON public.uber_viagens FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao')));
CREATE POLICY "mt_uber_viagens_insert" ON public.uber_viagens FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id());

ALTER TABLE public.uber_sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mt_uber_sync_select" ON public.uber_sync_logs FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin());

ALTER TABLE public.uber_drivers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins podem gerir motoristas Uber" ON public.uber_drivers;
CREATE POLICY "mt_uber_drivers_all" ON public.uber_drivers FOR ALL TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin())
  WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());

ALTER TABLE public.uber_driver_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mt_uber_tokens_all" ON public.uber_driver_tokens FOR ALL TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin())
  WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());

ALTER TABLE public.uber_driver_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mt_uber_profiles_all" ON public.uber_driver_profiles FOR ALL TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin())
  WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());

ALTER TABLE public.uber_driver_compliance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mt_uber_compliance_all" ON public.uber_driver_compliance FOR ALL TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin())
  WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());

ALTER TABLE public.uber_driver_risk_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mt_uber_risk_all" ON public.uber_driver_risk_profiles FOR ALL TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin())
  WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());

ALTER TABLE public.uber_vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mt_uber_vehicles_all" ON public.uber_vehicles FOR ALL TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin())
  WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());

ALTER TABLE public.uber_vehicle_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mt_uber_vdocs_all" ON public.uber_vehicle_documents FOR ALL TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin())
  WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());

ALTER TABLE public.uber_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mt_uber_transactions_select" ON public.uber_transactions FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin());

ALTER TABLE public.uber_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mt_uber_webhooks_all" ON public.uber_webhook_events FOR ALL TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin())
  WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());

-- Tabelas Uber opcionais (podem não existir em todos os ambientes)
DO $$ BEGIN
  ALTER TABLE public.uber_sync_cursors ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "mt_uber_cursors_all" ON public.uber_sync_cursors FOR ALL TO authenticated
    USING (org_id = get_current_org_id() AND is_current_user_admin())
    WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.uber_write_logs ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "mt_uber_wlogs_select" ON public.uber_write_logs FOR SELECT TO authenticated
    USING (org_id = get_current_org_id() AND is_current_user_admin());
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.uber_viagens_detalhadas ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "mt_uber_viagens_det_select" ON public.uber_viagens_detalhadas FOR SELECT TO authenticated
    USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao')));
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.uber_atividade_motoristas ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "mt_uber_atividade_select" ON public.uber_atividade_motoristas FOR SELECT TO authenticated
    USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao')));
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- ==================== COMBUSTÍVEL / CARTÕES (opcionais) ====================
DO $$ BEGIN
  ALTER TABLE public.via_verde_contas ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "mt_vv_contas_select" ON public.via_verde_contas FOR SELECT TO authenticated
    USING (org_id = get_current_org_id() AND is_current_user_admin());
  CREATE POLICY "mt_vv_contas_all" ON public.via_verde_contas FOR ALL TO authenticated
    USING (org_id = get_current_org_id() AND is_current_user_admin())
    WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.bp_cartoes ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "mt_bp_cartoes_all" ON public.bp_cartoes FOR ALL TO authenticated
    USING (org_id = get_current_org_id() AND is_current_user_admin())
    WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage bp_transacoes" ON public.bp_transacoes;
  CREATE POLICY "mt_bp_transacoes_all" ON public.bp_transacoes FOR ALL TO authenticated
    USING (org_id = get_current_org_id() AND is_current_user_admin())
    WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins podem gerir repsol_cartoes" ON public.repsol_cartoes;
  CREATE POLICY "mt_repsol_cartoes_all" ON public.repsol_cartoes FOR ALL TO authenticated
    USING (org_id = get_current_org_id() AND is_current_user_admin())
    WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins podem gerir repsol_transacoes" ON public.repsol_transacoes;
  CREATE POLICY "mt_repsol_transacoes_all" ON public.repsol_transacoes FOR ALL TO authenticated
    USING (org_id = get_current_org_id() AND is_current_user_admin())
    WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins podem gerir edp_cartoes" ON public.edp_cartoes;
  CREATE POLICY "mt_edp_cartoes_all" ON public.edp_cartoes FOR ALL TO authenticated
    USING (org_id = get_current_org_id() AND is_current_user_admin())
    WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins podem gerir edp_transacoes" ON public.edp_transacoes;
  CREATE POLICY "mt_edp_transacoes_all" ON public.edp_transacoes FOR ALL TO authenticated
    USING (org_id = get_current_org_id() AND is_current_user_admin())
    WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- ==================== SISTEMA ====================
-- sync_queue
DROP POLICY IF EXISTS "Admins can manage sync_queue" ON public.sync_queue;
DROP POLICY IF EXISTS "Service role full access to sync_queue" ON public.sync_queue;

CREATE POLICY "mt_sync_queue_all" ON public.sync_queue FOR ALL TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin())
  WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());

-- integracoes_webhooks
ALTER TABLE public.integracoes_webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mt_webhooks_select" ON public.integracoes_webhooks FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin());
CREATE POLICY "mt_webhooks_all" ON public.integracoes_webhooks FOR ALL TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin())
  WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());
