-- =========================================================
-- PERMISSÕES: Nível de Acesso (Ver / Editar)
-- =========================================================
-- Adiciona coluna pode_editar à tabela de permissões,
-- garante que todos os recursos existem na tabela recursos,
-- e cria função can_edit() para verificações no backend.
-- =========================================================

-- 1. Adicionar pode_editar à tabela cargo_permissoes
ALTER TABLE public.cargo_permissoes
  ADD COLUMN IF NOT EXISTS pode_editar BOOLEAN NOT NULL DEFAULT false;

-- 2. Garantir que todos os recursos do sistema existem
INSERT INTO public.recursos (nome, descricao, categoria) VALUES
  -- CRM
  ('crm_ver',             'Ver leads e pipeline CRM',             'CRM'),
  ('crm_exportar',        'Exportar dados de leads',              'CRM'),
  ('crm_campanhas',       'Gerir campanhas e tags',               'CRM'),
  ('motoristas_crm',      'Gestão completa do CRM',               'CRM'),

  -- Meus Tickets
  ('tickets_ver',         'Ver tickets',                          'Tickets'),
  ('tickets_criar',       'Criar novos tickets',                  'Tickets'),
  ('tickets_gerir',       'Gerir todos os tickets',               'Tickets'),

  -- Motoristas
  ('motoristas_ver',          'Ver lista de motoristas',          'Motoristas'),
  ('motoristas_criar',        'Criar novos motoristas',           'Motoristas'),
  ('motoristas_editar',       'Editar dados de motoristas',       'Motoristas'),
  ('motoristas_eliminar',     'Eliminar motoristas',              'Motoristas'),
  ('motoristas_candidaturas', 'Gerir candidaturas de motoristas', 'Motoristas'),
  ('motoristas_gestao',       'Gestão completa de motoristas',    'Motoristas'),
  ('motoristas_contactos',    'Gestão de contactos',              'Motoristas'),
  ('motorista_painel',        'Painel exclusivo do motorista',    'Motoristas'),

  -- Viaturas
  ('viaturas_ver',        'Ver lista de viaturas',                'Viaturas'),
  ('viaturas_criar',      'Criar novas viaturas',                 'Viaturas'),
  ('viaturas_editar',     'Editar dados de viaturas',             'Viaturas'),
  ('viaturas_eliminar',   'Eliminar viaturas',                    'Viaturas'),

  -- Contratos
  ('contratos_ver',           'Ver contratos',                    'Contratos'),
  ('contratos_criar',         'Criar novos contratos',            'Contratos'),
  ('contratos_reimprimir',    'Reimprimir contratos',             'Contratos'),
  ('motoristas_contratos',    'Gestão completa de contratos',     'Contratos'),

  -- Financeiro
  ('financeiro_recibos',  'Gestão de recibos verdes',             'Financeiro'),

  -- Dashboard
  ('dashboard_ver',       'Aceder ao Dashboard geral',            'Dashboard'),

  -- Marketing
  ('marketing_ver',       'Aceder ao módulo de Marketing',        'Marketing'),

  -- Calendário
  ('calendario_ver',      'Ver eventos do calendário',            'Calendário'),
  ('calendario_criar',    'Criar novos eventos',                  'Calendário'),
  ('calendario_editar',   'Editar eventos existentes',            'Calendário'),
  ('calendario_eliminar', 'Eliminar eventos',                     'Calendário'),

  -- Assistência
  ('assistencia_ver',         'Ver tickets de assistência',       'Assistência'),
  ('assistencia_criar',       'Criar tickets de assistência',     'Assistência'),
  ('assistencia_categorias',  'Gerir categorias de assistência',  'Assistência'),
  ('assistencia_tickets',     'Gestão completa de assistência',   'Assistência'),

  -- Administração
  ('admin_utilizadores',  'Gerir utilizadores e contas',          'Administração'),
  ('admin_grupos',        'Gerir grupos e permissões',            'Administração'),
  ('admin_documentos',    'Gerir templates de documentos',        'Administração'),
  ('admin_formularios',   'Gerir formulários',                    'Administração'),
  ('admin_integracoes',   'Gerir integrações externas',           'Administração'),
  ('admin_configuracoes', 'Configurações do sistema',             'Administração')

ON CONFLICT (nome) DO NOTHING;

-- 3. Função can_edit() – verifica se o utilizador pode editar um recurso
CREATE OR REPLACE FUNCTION public.can_edit(_user_id uuid, _recurso text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  _cargo_id UUID;
BEGIN
  -- Admins podem editar tudo
  IF EXISTS (
    SELECT 1 FROM public.profiles WHERE id = _user_id AND is_admin = true
  ) THEN
    RETURN true;
  END IF;

  SELECT cargo_id INTO _cargo_id FROM public.profiles WHERE id = _user_id;
  IF _cargo_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.cargo_permissoes cp
    JOIN public.recursos r ON cp.recurso_id = r.id
    WHERE cp.cargo_id   = _cargo_id
      AND r.nome        = _recurso
      AND cp.tem_acesso = true
      AND cp.pode_editar = true
  );
END;
$$;

-- 4. Garantir que cargo_permissoes tem RLS policies actualizadas
-- (a tabela já tem RLS; apenas garantir que admins podem gerir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'cargo_permissoes'
      AND policyname = 'Admins gerem cargo_permissoes'
  ) THEN
    CREATE POLICY "Admins gerem cargo_permissoes"
    ON public.cargo_permissoes FOR ALL
    USING (is_current_user_admin())
    WITH CHECK (is_current_user_admin());
  END IF;
END $$;
