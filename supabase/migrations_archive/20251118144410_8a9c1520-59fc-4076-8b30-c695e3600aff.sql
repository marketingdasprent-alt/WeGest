-- 1. Remover campo nivel_acesso da tabela cargos
ALTER TABLE public.cargos DROP COLUMN IF EXISTS nivel_acesso;

-- 2. Limpar e recriar recursos baseados em páginas reais
DELETE FROM public.cargo_permissoes;
DELETE FROM public.recursos;

-- 3. Inserir recursos baseados nas páginas do sistema
INSERT INTO public.recursos (nome, categoria, descricao) VALUES
  -- Páginas Principais
  ('crm', 'Páginas', 'Gestão de Leads e CRM'),
  ('contatos', 'Páginas', 'Gestão de Contatos'),
  ('motoristas', 'Páginas', 'Gestão de Motoristas'),
  ('formularios', 'Páginas', 'Gestão de Formulários'),
  ('dasprent_leads', 'Páginas', 'Leads da DasPrent'),
  ('dasprent_funcionarios', 'Páginas', 'Funcionários da DasPrent'),
  
  -- Páginas Admin
  ('admin_convites', 'Administração', 'Gestão de Convites'),
  ('admin_configuracoes', 'Administração', 'Configurações do Sistema');