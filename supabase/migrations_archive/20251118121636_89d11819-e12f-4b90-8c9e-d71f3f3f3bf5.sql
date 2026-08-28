-- FASE 1: Sistema RBAC Completo

-- 1. Criar enum para roles
CREATE TYPE public.app_role AS ENUM ('admin', 'gestor_tvde', 'gestor_comercial', 'colaborador');

-- 2. Criar tabela de cargos (posições na empresa)
CREATE TABLE public.cargos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  nivel_acesso INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Criar tabela de recursos do sistema
CREATE TABLE public.recursos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  categoria TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Criar tabela de permissões por cargo
CREATE TABLE public.cargo_permissoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cargo_id UUID REFERENCES public.cargos(id) ON DELETE CASCADE NOT NULL,
  recurso_id UUID REFERENCES public.recursos(id) ON DELETE CASCADE NOT NULL,
  pode_ver BOOLEAN DEFAULT false,
  pode_criar BOOLEAN DEFAULT false,
  pode_editar BOOLEAN DEFAULT false,
  pode_deletar BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cargo_id, recurso_id)
);

-- 5. Criar tabela de roles de usuário
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(user_id, role)
);

-- 6. Adicionar cargo_id à tabela profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cargo_id UUID REFERENCES public.cargos(id);

-- 7. Criar índices para performance
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_role ON public.user_roles(role);
CREATE INDEX idx_cargo_permissoes_cargo ON public.cargo_permissoes(cargo_id);
CREATE INDEX idx_profiles_cargo ON public.profiles(cargo_id);

-- 8. Habilitar RLS em todas as tabelas
ALTER TABLE public.cargos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recursos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cargo_permissoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 9. Criar função security definer para verificar role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 10. Criar função para verificar permissão
CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _recurso TEXT, _acao TEXT)
RETURNS BOOLEAN
LANGUAGE PLPGSQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cargo_id UUID;
BEGIN
  -- Admins têm todas as permissões
  IF has_role(_user_id, 'admin') THEN
    RETURN true;
  END IF;

  -- Buscar cargo do usuário
  SELECT cargo_id INTO _cargo_id FROM public.profiles WHERE id = _user_id;
  
  IF _cargo_id IS NULL THEN
    RETURN false;
  END IF;

  -- Verificar permissão específica
  RETURN EXISTS (
    SELECT 1
    FROM public.cargo_permissoes cp
    JOIN public.recursos r ON cp.recurso_id = r.id
    WHERE cp.cargo_id = _cargo_id
      AND r.nome = _recurso
      AND (
        (_acao = 'ver' AND cp.pode_ver = true) OR
        (_acao = 'criar' AND cp.pode_criar = true) OR
        (_acao = 'editar' AND cp.pode_editar = true) OR
        (_acao = 'deletar' AND cp.pode_deletar = true)
      )
  );
END;
$$;

-- 11. Políticas RLS para cargos
CREATE POLICY "Todos podem ver cargos"
  ON public.cargos FOR SELECT
  USING (true);

CREATE POLICY "Apenas admins podem gerenciar cargos"
  ON public.cargos FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- 12. Políticas RLS para recursos
CREATE POLICY "Todos podem ver recursos"
  ON public.recursos FOR SELECT
  USING (true);

CREATE POLICY "Apenas admins podem gerenciar recursos"
  ON public.recursos FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- 13. Políticas RLS para cargo_permissoes
CREATE POLICY "Todos podem ver permissões"
  ON public.cargo_permissoes FOR SELECT
  USING (true);

CREATE POLICY "Apenas admins podem gerenciar permissões"
  ON public.cargo_permissoes FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- 14. Políticas RLS para user_roles
CREATE POLICY "Usuários podem ver seus próprios roles"
  ON public.user_roles FOR SELECT
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Apenas admins podem gerenciar roles"
  ON public.user_roles FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- 15. Inserir cargos padrão
INSERT INTO public.cargos (nome, descricao, nivel_acesso) VALUES
  ('Administrador', 'Acesso total ao sistema', 100),
  ('Gestor TVDE', 'Gestão de motoristas e leads TVDE', 80),
  ('Gestor Comercial', 'Gestão comercial e vendas', 70),
  ('Colaborador', 'Acesso básico ao sistema', 50);

-- 16. Inserir recursos padrão
INSERT INTO public.recursos (nome, descricao, categoria) VALUES
  ('motoristas', 'Gestão de motoristas ativos', 'motoristas'),
  ('leads_dasprent', 'Gestão de leads DasPrent', 'crm'),
  ('formularios', 'Gestão de formulários', 'admin'),
  ('users', 'Gestão de utilizadores', 'admin'),
  ('convites', 'Gestão de convites', 'admin'),
  ('relatorios', 'Visualização de relatórios', 'relatorios');

-- 17. Configurar permissões padrão para cada cargo
DO $$
DECLARE
  cargo_admin_id UUID;
  cargo_gestor_tvde_id UUID;
  cargo_gestor_comercial_id UUID;
  cargo_colaborador_id UUID;
  recurso_motoristas_id UUID;
  recurso_leads_id UUID;
  recurso_formularios_id UUID;
  recurso_users_id UUID;
  recurso_convites_id UUID;
  recurso_relatorios_id UUID;
BEGIN
  -- Buscar IDs dos cargos
  SELECT id INTO cargo_admin_id FROM public.cargos WHERE nome = 'Administrador';
  SELECT id INTO cargo_gestor_tvde_id FROM public.cargos WHERE nome = 'Gestor TVDE';
  SELECT id INTO cargo_gestor_comercial_id FROM public.cargos WHERE nome = 'Gestor Comercial';
  SELECT id INTO cargo_colaborador_id FROM public.cargos WHERE nome = 'Colaborador';

  -- Buscar IDs dos recursos
  SELECT id INTO recurso_motoristas_id FROM public.recursos WHERE nome = 'motoristas';
  SELECT id INTO recurso_leads_id FROM public.recursos WHERE nome = 'leads_dasprent';
  SELECT id INTO recurso_formularios_id FROM public.recursos WHERE nome = 'formularios';
  SELECT id INTO recurso_users_id FROM public.recursos WHERE nome = 'users';
  SELECT id INTO recurso_convites_id FROM public.recursos WHERE nome = 'convites';
  SELECT id INTO recurso_relatorios_id FROM public.recursos WHERE nome = 'relatorios';

  -- Permissões para Administrador (todas)
  INSERT INTO public.cargo_permissoes (cargo_id, recurso_id, pode_ver, pode_criar, pode_editar, pode_deletar) VALUES
    (cargo_admin_id, recurso_motoristas_id, true, true, true, true),
    (cargo_admin_id, recurso_leads_id, true, true, true, true),
    (cargo_admin_id, recurso_formularios_id, true, true, true, true),
    (cargo_admin_id, recurso_users_id, true, true, true, true),
    (cargo_admin_id, recurso_convites_id, true, true, true, true),
    (cargo_admin_id, recurso_relatorios_id, true, true, true, true);

  -- Permissões para Gestor TVDE
  INSERT INTO public.cargo_permissoes (cargo_id, recurso_id, pode_ver, pode_criar, pode_editar, pode_deletar) VALUES
    (cargo_gestor_tvde_id, recurso_motoristas_id, true, true, true, false),
    (cargo_gestor_tvde_id, recurso_leads_id, true, true, true, false),
    (cargo_gestor_tvde_id, recurso_relatorios_id, true, false, false, false);

  -- Permissões para Gestor Comercial
  INSERT INTO public.cargo_permissoes (cargo_id, recurso_id, pode_ver, pode_criar, pode_editar, pode_deletar) VALUES
    (cargo_gestor_comercial_id, recurso_leads_id, true, true, true, false),
    (cargo_gestor_comercial_id, recurso_relatorios_id, true, false, false, false);

  -- Permissões para Colaborador
  INSERT INTO public.cargo_permissoes (cargo_id, recurso_id, pode_ver, pode_criar, pode_editar, pode_deletar) VALUES
    (cargo_colaborador_id, recurso_leads_id, true, true, false, false);
END $$;

-- 18. Migrar usuários admin existentes para user_roles
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role
FROM public.profiles
WHERE is_admin = true
ON CONFLICT (user_id, role) DO NOTHING;

-- 19. Atribuir cargo aos perfis existentes baseado no cargo atual
UPDATE public.profiles p
SET cargo_id = c.id
FROM public.cargos c
WHERE p.cargo = c.nome;

-- 20. Trigger para atualizar updated_at em cargos
CREATE TRIGGER update_cargos_updated_at
  BEFORE UPDATE ON public.cargos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();