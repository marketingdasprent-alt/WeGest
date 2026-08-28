-- ============================================================
-- FASE 4: Defaults automáticos para org_id
-- ============================================================
-- Com este default, qualquer INSERT que não passe org_id explicitamente
-- vai usar automaticamente a org ativa do user.
-- Isto evita ter que modificar TODOS os componentes frontend.
-- ============================================================

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'motoristas', 'motoristas_ativos', 'motorista_candidaturas',
    'motorista_viaturas', 'motorista_documentos', 'motorista_financeiro', 'motorista_recibos',
    'viaturas', 'viatura_documentos', 'viatura_danos', 'viatura_reparacoes',
    'viatura_multas', 'viatura_reservas', 'viatura_dano_fotos',
    'viatura_proprietarios', 'viatura_tipos', 'reparacao_parcelas',
    'contratos', 'contratos_reimpressoes', 'contratos_edicoes', 'contrato_media',
    'assistencia_categorias', 'assistencia_tickets', 'assistencia_mensagens',
    'assistencia_anexos', 'assistencia_ticket_acessos',
    'calendario_eventos', 'calendario_config', 'calendario_eventos_historico',
    'leads_dasprent', 'marketing_listas', 'marketing_contactos',
    'marketing_campanhas', 'marketing_assinaturas', 'marketing_envios',
    'marketing_envio_detalhes', 'email_sends',
    'plataformas_configuracao',
    'bolt_viagens', 'bolt_mapeamento_motoristas', 'bolt_sync_logs',
    'bolt_drivers', 'bolt_vehicles', 'bolt_resumos_semanais',
    'uber_viagens', 'uber_sync_logs', 'uber_drivers', 'uber_driver_tokens',
    'uber_driver_profiles', 'uber_driver_compliance', 'uber_driver_risk_profiles',
    'uber_vehicles', 'uber_vehicle_documents', 'uber_transactions',
    'uber_webhook_events', 'uber_sync_cursors', 'uber_write_logs',
    'uber_viagens_detalhadas', 'uber_atividade_motoristas',
    'via_verde_contas', 'bp_cartoes', 'bp_transacoes',
    'repsol_cartoes', 'repsol_transacoes', 'edp_cartoes', 'edp_transacoes',
    'profiles', 'cargos', 'cargo_permissoes',
    'estacoes', 'empresas', 'document_templates',
    'integracoes_webhooks', 'sync_queue'
  ]
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN org_id SET DEFAULT get_current_org_id()',
        tbl
      );
    EXCEPTION WHEN undefined_table OR undefined_column THEN
      RAISE NOTICE 'Tabela % ou coluna org_id não existe, ignorando default', tbl;
    END;
  END LOOP;
END $$;
