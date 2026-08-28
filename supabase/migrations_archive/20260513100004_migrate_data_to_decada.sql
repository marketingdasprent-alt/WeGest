-- ============================================================
-- FASE 2.2: Criar orgs e migrar dados existentes para Década
-- ============================================================

-- Criar as duas organizações
INSERT INTO public.organizacoes (id, nome, codigo, ativa) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Década Ousada', 'decada', true),
  ('22222222-2222-2222-2222-222222222222', 'Distância Arrojada', 'distancia', true)
ON CONFLICT (codigo) DO NOTHING;

-- =====================================================================
-- Migrar TODOS os dados existentes para Década Ousada
-- =====================================================================
DO $$
DECLARE
  decada_id uuid := '11111111-1111-1111-1111-111111111111';
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
    -- Integrações Bolt
    'plataformas_configuracao', 'bolt_viagens', 'bolt_mapeamento_motoristas',
    'bolt_sync_logs', 'bolt_drivers', 'bolt_vehicles', 'bolt_resumos_semanais',
    -- Integrações Uber
    'uber_viagens', 'uber_sync_logs', 'uber_drivers', 'uber_driver_tokens',
    'uber_driver_profiles', 'uber_driver_compliance', 'uber_driver_risk_profiles',
    'uber_vehicles', 'uber_vehicle_documents', 'uber_transactions',
    'uber_webhook_events', 'uber_sync_cursors', 'uber_write_logs',
    'uber_viagens_detalhadas', 'uber_atividade_motoristas',
    -- Cartões
    'via_verde_contas', 'bp_cartoes', 'bp_transacoes',
    'repsol_cartoes', 'repsol_transacoes', 'edp_cartoes', 'edp_transacoes',
    -- Config/RBAC
    'profiles', 'cargos', 'cargo_permissoes',
    'estacoes', 'empresas', 'document_templates',
    'integracoes_webhooks', 'sync_queue'
  ]
  LOOP
    BEGIN
      EXECUTE format('UPDATE public.%I SET org_id = $1 WHERE org_id IS NULL', tbl)
      USING decada_id;
    EXCEPTION
      WHEN undefined_table THEN
        RAISE NOTICE 'Tabela % não existe, ignorando', tbl;
      WHEN undefined_column THEN
        RAISE NOTICE 'Tabela % sem coluna org_id ou trigger com coluna inexistente, ignorando', tbl;
    END;
  END LOOP;
END $$;

-- =====================================================================
-- Associar todos os users existentes à Década
-- =====================================================================
INSERT INTO public.user_organizacoes (user_id, org_id, role)
SELECT id, '11111111-1111-1111-1111-111111111111', 'member'
FROM auth.users
ON CONFLICT (user_id, org_id) DO NOTHING;

-- Definir org ativa para todos os users
INSERT INTO public.user_org_ativa (user_id, org_id)
SELECT id, '11111111-1111-1111-1111-111111111111'
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- =====================================================================
-- Tornar org_id NOT NULL nas tabelas principais
-- (apenas as que certamente têm dados e precisam de isolamento forte)
-- =====================================================================
ALTER TABLE public.motoristas ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.viaturas ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.cargos ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.contratos ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.assistencia_tickets ALTER COLUMN org_id SET NOT NULL;
