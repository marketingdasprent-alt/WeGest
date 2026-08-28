-- 1. Simplificar tabela cargo_permissoes
ALTER TABLE cargo_permissoes 
  DROP COLUMN IF EXISTS pode_criar,
  DROP COLUMN IF EXISTS pode_editar,
  DROP COLUMN IF EXISTS pode_deletar;

ALTER TABLE cargo_permissoes 
  RENAME COLUMN pode_ver TO tem_acesso;

ALTER TABLE cargo_permissoes 
  ALTER COLUMN tem_acesso SET DEFAULT false;

-- 2. Limpar recursos existentes
TRUNCATE TABLE cargo_permissoes CASCADE;
DELETE FROM recursos;

-- 3. Adicionar novos recursos
INSERT INTO recursos (nome, categoria, descricao) VALUES
  -- Admin
  ('admin_utilizadores', 'admin', 'Gestão de Utilizadores - criar, editar, deletar utilizadores'),
  ('admin_configuracoes', 'admin', 'Gestão de Configurações do sistema'),
  ('admin_formularios', 'admin', 'Gestão de Formulários - criar, editar, deletar formulários'),
  
  -- Motoristas
  ('motoristas_gestao', 'motoristas', 'Gestão de Motoristas - ver, criar, editar, deletar, gerar contratos'),
  ('motoristas_contactos', 'motoristas', 'Gestão de Contactos'),
  ('motoristas_crm', 'motoristas', 'Gestão de CRM - leads e pipeline de vendas');

-- 4. Atualizar função has_permission para versão simplificada
CREATE OR REPLACE FUNCTION public.has_permission(
  _user_id uuid, 
  _recurso text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cargo_id UUID;
BEGIN
  -- Admins têm todas as permissões
  IF has_role(_user_id, 'admin') THEN
    RETURN true;
  END IF;

  -- Buscar cargo do usuário
  SELECT cargo_id INTO _cargo_id 
  FROM public.profiles 
  WHERE id = _user_id;
  
  IF _cargo_id IS NULL THEN
    RETURN false;
  END IF;

  -- Verificar se tem acesso ao recurso
  RETURN EXISTS (
    SELECT 1
    FROM public.cargo_permissoes cp
    JOIN public.recursos r ON cp.recurso_id = r.id
    WHERE cp.cargo_id = _cargo_id
      AND r.nome = _recurso
      AND cp.tem_acesso = true
  );
END;
$$;