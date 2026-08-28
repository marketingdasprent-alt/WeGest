-- ============================================================
-- FASE 2.1: Adicionar org_id a todas as tabelas de negócio
-- ============================================================
-- Nota: org_id começa como NULL para permitir migração incremental.
-- Será definido como NOT NULL na migration seguinte após migração dos dados.
-- Usa DO block com exception handling para ignorar tabelas que não existem.

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    -- Motoristas
    'motoristas', 'motoristas_ativos', 'motorista_candidaturas',
    'motorista_viaturas', 'motorista_documentos', 'motorista_financeiro', 'motorista_recibos',
    -- Viaturas
    'viaturas', 'viatura_documentos', 'viatura_danos', 'viatura_reparacoes',
    'viatura_multas', 'viatura_reservas', 'viatura_dano_fotos',
    'viatura_proprietarios', 'viatura_tipos', 'reparacao_parcelas',
    -- Contratos
    'contratos', 'contratos_reimpressoes', 'contratos_edicoes', 'contrato_media',
    -- Assistência
    'assistencia_categorias', 'assistencia_tickets', 'assistencia_mensagens',
    'assistencia_anexos', 'assistencia_ticket_acessos',
    -- Calendário
    'calendario_eventos', 'calendario_config', 'calendario_eventos_historico',
    -- Marketing
    'leads_dasprent', 'marketing_listas', 'marketing_contactos',
    'marketing_campanhas', 'marketing_assinaturas', 'marketing_envios',
    'marketing_envio_detalhes', 'email_sends',
    -- Integrações
    'plataformas_configuracao',
    'bolt_viagens', 'bolt_mapeamento_motoristas', 'bolt_sync_logs',
    'bolt_drivers', 'bolt_vehicles', 'bolt_resumos_semanais',
    -- Uber
    'uber_viagens', 'uber_sync_logs', 'uber_drivers', 'uber_driver_tokens',
    'uber_driver_profiles', 'uber_driver_compliance', 'uber_driver_risk_profiles',
    'uber_vehicles', 'uber_vehicle_documents', 'uber_transactions',
    'uber_webhook_events', 'uber_sync_cursors', 'uber_write_logs',
    'uber_viagens_detalhadas', 'uber_atividade_motoristas',
    -- Cartões combustível
    'via_verde_contas', 'bp_cartoes', 'bp_transacoes',
    'repsol_cartoes', 'repsol_transacoes', 'edp_cartoes', 'edp_transacoes',
    -- Config/RBAC
    'profiles', 'cargos', 'cargo_permissoes',
    'estacoes', 'empresas', 'document_templates',
    'integracoes_webhooks', 'sync_queue'
  ]
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizacoes(id)',
        tbl
      );
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_%s_org ON public.%I(org_id)',
        tbl, tbl
      );
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'Tabela % não existe, ignorando', tbl;
    END;
  END LOOP;
END $$;
