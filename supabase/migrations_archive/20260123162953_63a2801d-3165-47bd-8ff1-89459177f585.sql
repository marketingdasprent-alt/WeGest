-- Normalizar categorias existentes e adicionar novos recursos granulares

-- 1. Atualizar categorias existentes para normalização
UPDATE recursos SET categoria = 'CRM' WHERE categoria ILIKE '%crm%';
UPDATE recursos SET categoria = 'Motoristas' WHERE categoria ILIKE '%motorista%';
UPDATE recursos SET categoria = 'Administração' WHERE categoria ILIKE '%admin%';
UPDATE recursos SET categoria = 'Assistência' WHERE categoria ILIKE '%assist%';
UPDATE recursos SET categoria = 'Contratos' WHERE categoria ILIKE '%contrato%';

-- 2. Inserir novos recursos granulares (ignorar se já existirem)

-- CRM
INSERT INTO recursos (nome, categoria, descricao) VALUES 
  ('crm_ver', 'CRM', 'Ver leads e pipeline'),
  ('crm_exportar', 'CRM', 'Exportar dados de leads'),
  ('crm_campanhas', 'CRM', 'Gerir campanhas e tags')
ON CONFLICT (nome) DO NOTHING;

-- Tickets
INSERT INTO recursos (nome, categoria, descricao) VALUES 
  ('tickets_ver', 'Tickets', 'Ver tickets'),
  ('tickets_criar', 'Tickets', 'Criar novos tickets'),
  ('tickets_gerir', 'Tickets', 'Gerir todos os tickets')
ON CONFLICT (nome) DO NOTHING;

-- Motoristas
INSERT INTO recursos (nome, categoria, descricao) VALUES 
  ('motoristas_ver', 'Motoristas', 'Ver lista de motoristas'),
  ('motoristas_criar', 'Motoristas', 'Criar novos motoristas'),
  ('motoristas_editar', 'Motoristas', 'Editar dados de motoristas'),
  ('motoristas_eliminar', 'Motoristas', 'Eliminar motoristas'),
  ('motoristas_candidaturas', 'Motoristas', 'Gerir candidaturas')
ON CONFLICT (nome) DO NOTHING;

-- Viaturas
INSERT INTO recursos (nome, categoria, descricao) VALUES 
  ('viaturas_ver', 'Viaturas', 'Ver lista de viaturas'),
  ('viaturas_criar', 'Viaturas', 'Criar novas viaturas'),
  ('viaturas_editar', 'Viaturas', 'Editar dados de viaturas'),
  ('viaturas_eliminar', 'Viaturas', 'Eliminar viaturas')
ON CONFLICT (nome) DO NOTHING;

-- Contratos
INSERT INTO recursos (nome, categoria, descricao) VALUES 
  ('contratos_ver', 'Contratos', 'Ver contratos'),
  ('contratos_criar', 'Contratos', 'Criar novos contratos'),
  ('contratos_reimprimir', 'Contratos', 'Reimprimir contratos')
ON CONFLICT (nome) DO NOTHING;

-- Assistência
INSERT INTO recursos (nome, categoria, descricao) VALUES 
  ('assistencia_ver', 'Assistência', 'Ver tickets de assistência'),
  ('assistencia_criar', 'Assistência', 'Criar tickets de assistência'),
  ('assistencia_categorias', 'Assistência', 'Gerir categorias de assistência')
ON CONFLICT (nome) DO NOTHING;

-- Administração
INSERT INTO recursos (nome, categoria, descricao) VALUES 
  ('admin_utilizadores', 'Administração', 'Gerir utilizadores do sistema'),
  ('admin_grupos', 'Administração', 'Gerir grupos e permissões'),
  ('admin_documentos', 'Administração', 'Gerir templates de documentos'),
  ('admin_formularios', 'Administração', 'Gerir formulários'),
  ('admin_integracoes', 'Administração', 'Gerir integrações externas')
ON CONFLICT (nome) DO NOTHING;

-- 3. Atualizar categorias de recursos antigos para manter consistência
UPDATE recursos SET categoria = 'Motoristas' WHERE nome IN ('motoristas_gestao', 'motoristas_contactos', 'motoristas_crm', 'motoristas_contratos');
UPDATE recursos SET categoria = 'Assistência' WHERE nome IN ('assistencia_tickets', 'assistencia_categorias');
UPDATE recursos SET categoria = 'Administração' WHERE nome IN ('admin_utilizadores', 'admin_configuracoes', 'admin_formularios', 'admin_documentos');