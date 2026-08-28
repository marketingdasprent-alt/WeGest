-- ============================================
-- FASE 1: CORRIGIR POLÍTICAS RLS
-- ============================================

-- 1.1 MOTORISTAS
-- Remover policies antigas
DROP POLICY IF EXISTS "Authenticated users can view motoristas" ON motoristas;
DROP POLICY IF EXISTS "Authenticated users can create motoristas" ON motoristas;
DROP POLICY IF EXISTS "Authenticated users can update motoristas" ON motoristas;

-- Criar novas policies baseadas em permissões
CREATE POLICY "Permissão para ver motoristas"
ON motoristas FOR SELECT
USING (
  is_current_user_admin() OR
  has_permission(auth.uid(), 'motoristas_gestao')
);

CREATE POLICY "Permissão para criar motoristas"
ON motoristas FOR INSERT
WITH CHECK (
  is_current_user_admin() OR
  has_permission(auth.uid(), 'motoristas_gestao')
);

CREATE POLICY "Permissão para editar motoristas"
ON motoristas FOR UPDATE
USING (
  is_current_user_admin() OR
  has_permission(auth.uid(), 'motoristas_gestao')
);

-- 1.2 MOTORISTAS ATIVOS
-- Remover policies antigas
DROP POLICY IF EXISTS "Authenticated users can view motoristas_ativos" ON motoristas_ativos;
DROP POLICY IF EXISTS "Authenticated users can create motoristas_ativos" ON motoristas_ativos;
DROP POLICY IF EXISTS "Authenticated users can update motoristas_ativos" ON motoristas_ativos;

-- Criar novas policies baseadas em permissões
CREATE POLICY "Permissão para ver motoristas ativos"
ON motoristas_ativos FOR SELECT
USING (
  is_current_user_admin() OR
  has_permission(auth.uid(), 'motoristas_gestao')
);

CREATE POLICY "Permissão para criar motoristas ativos"
ON motoristas_ativos FOR INSERT
WITH CHECK (
  is_current_user_admin() OR
  has_permission(auth.uid(), 'motoristas_gestao')
);

CREATE POLICY "Permissão para editar motoristas ativos"
ON motoristas_ativos FOR UPDATE
USING (
  is_current_user_admin() OR
  has_permission(auth.uid(), 'motoristas_gestao')
);

-- 1.3 LEADS DASPRENT
-- Remover policy que usa cargo texto
DROP POLICY IF EXISTS "Gestores podem ver leads disponíveis e próprios" ON leads_dasprent;
DROP POLICY IF EXISTS "Gestores podem atualizar seus leads" ON leads_dasprent;

-- Nova policy baseada em permissões
CREATE POLICY "Permissão para ver leads"
ON leads_dasprent FOR SELECT
USING (
  is_current_user_admin() OR
  has_permission(auth.uid(), 'motoristas_crm') OR
  -- Gestor pode ver seus próprios leads
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() 
      AND p.nome = leads_dasprent.gestor_responsavel
  )
);

CREATE POLICY "Permissão para editar leads"
ON leads_dasprent FOR UPDATE
USING (
  is_current_user_admin() OR
  (has_permission(auth.uid(), 'motoristas_crm') AND 
   EXISTS (
     SELECT 1 FROM profiles p
     WHERE p.id = auth.uid() 
       AND p.nome = leads_dasprent.gestor_responsavel
   ))
)
WITH CHECK (
  is_current_user_admin() OR
  (has_permission(auth.uid(), 'motoristas_crm') AND 
   EXISTS (
     SELECT 1 FROM profiles p
     WHERE p.id = auth.uid() 
       AND p.nome = leads_dasprent.gestor_responsavel
   ))
);

-- 1.4 PROFILES
-- Substituir policy aberta
DROP POLICY IF EXISTS "Todos podem visualizar perfis" ON profiles;

CREATE POLICY "Permissão para ver perfis"
ON profiles FOR SELECT
USING (
  auth.uid() = id OR  -- Ver próprio perfil
  is_current_user_admin() OR
  has_permission(auth.uid(), 'admin_utilizadores')
);

-- 1.5 FORMULÁRIOS
-- Remover policy existente
DROP POLICY IF EXISTS "Anyone can view active formularios" ON formularios;

-- Manter acesso público para formulários ativos + permissão para ver todos
CREATE POLICY "Permissão para ver formulários"
ON formularios FOR SELECT
USING (
  ativo = true OR  -- Todos podem ver ativos (para formulários públicos)
  is_current_user_admin() OR
  has_permission(auth.uid(), 'admin_formularios')
);

-- ============================================
-- FASE 2: CONFIGURAR PERMISSÕES DOS GRUPOS
-- ============================================

-- 2.1 GRUPO ADMINISTRADOR - Acesso total
INSERT INTO cargo_permissoes (cargo_id, recurso_id, tem_acesso)
SELECT 
  c.id,
  r.id,
  true
FROM cargos c
CROSS JOIN recursos r
WHERE c.nome = 'Administrador'
ON CONFLICT (cargo_id, recurso_id) DO UPDATE
SET tem_acesso = true;

-- 2.2 GRUPO GESTOR TVDE - Acesso a motoristas e CRM
INSERT INTO cargo_permissoes (cargo_id, recurso_id, tem_acesso)
SELECT 
  c.id,
  r.id,
  true
FROM cargos c
CROSS JOIN recursos r
WHERE c.nome = 'Gestor TVDE'
  AND r.nome IN ('motoristas_gestao', 'motoristas_contactos', 'motoristas_crm')
ON CONFLICT (cargo_id, recurso_id) DO UPDATE
SET tem_acesso = true;

-- 2.3 GRUPO GESTOR DOCUMENTAL - Acesso apenas a motoristas
INSERT INTO cargo_permissoes (cargo_id, recurso_id, tem_acesso)
SELECT 
  c.id,
  r.id,
  true
FROM cargos c
CROSS JOIN recursos r
WHERE c.nome = 'Gestor Documental'
  AND r.nome IN ('motoristas_gestao', 'motoristas_contactos')
ON CONFLICT (cargo_id, recurso_id) DO UPDATE
SET tem_acesso = true;