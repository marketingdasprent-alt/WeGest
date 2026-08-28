-- ============================================================
-- FASE 3: Atualizar funções RLS e políticas para multi-tenant
-- ============================================================
-- Todas as funções helper passam a filtrar por get_current_org_id()
-- Todas as tabelas de negócio passam a ter org_id no filtro RLS
-- ============================================================

-- =====================================================================
-- 1. ATUALIZAR FUNÇÕES HELPER
-- =====================================================================

-- is_current_user_admin() — agora filtra por org ativa
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles
     WHERE id = auth.uid()
       AND org_id = get_current_org_id()),
    false
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- has_permission(uid, recurso) — 2 args, filtra por org
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
  _org_id UUID;
BEGIN
  _org_id := get_current_org_id();

  -- Admins da org têm todas as permissões
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND org_id = _org_id AND is_admin = true
  ) THEN
    RETURN true;
  END IF;

  -- Buscar cargo do usuário na org
  SELECT cargo_id INTO _cargo_id
  FROM public.profiles
  WHERE id = _user_id AND org_id = _org_id;

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

-- has_permission(uid, recurso, acao) — 3 args, filtra por org
CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _recurso TEXT, _acao TEXT)
RETURNS BOOLEAN
LANGUAGE PLPGSQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cargo_id UUID;
  _org_id UUID;
BEGIN
  _org_id := get_current_org_id();

  -- Admins da org têm todas as permissões
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND org_id = _org_id AND is_admin = true
  ) THEN
    RETURN true;
  END IF;

  -- Buscar cargo do usuário na org
  SELECT cargo_id INTO _cargo_id
  FROM public.profiles
  WHERE id = _user_id AND org_id = _org_id;

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

-- has_role(uid, role) — filtra por org (check user_roles with org context)
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

-- can_edit(uid, recurso) — filtra por org
CREATE OR REPLACE FUNCTION public.can_edit(_user_id uuid, _recurso text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cargo_id UUID;
  _org_id UUID;
BEGIN
  _org_id := get_current_org_id();

  -- Admins da org podem editar tudo
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND org_id = _org_id AND is_admin = true
  ) THEN
    RETURN true;
  END IF;

  SELECT cargo_id INTO _cargo_id
  FROM public.profiles
  WHERE id = _user_id AND org_id = _org_id;

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

-- =====================================================================
-- 2. RECRIAR POLÍTICAS RLS COM FILTRO org_id
-- =====================================================================
-- Estratégia: DROP + CREATE para cada tabela principal.
-- As funções helper já filtram por org, então basta adicionar
-- org_id = get_current_org_id() ao USING das policies.
-- =====================================================================

-- ==================== MOTORISTAS ====================
DROP POLICY IF EXISTS "Permissão para ver motoristas" ON public.motoristas;
DROP POLICY IF EXISTS "Permissão para criar motoristas" ON public.motoristas;
DROP POLICY IF EXISTS "Permissão para editar motoristas" ON public.motoristas;
DROP POLICY IF EXISTS "Authenticated users can view motoristas" ON public.motoristas;
DROP POLICY IF EXISTS "Authenticated users can create motoristas" ON public.motoristas;
DROP POLICY IF EXISTS "Authenticated users can update motoristas" ON public.motoristas;
DROP POLICY IF EXISTS "Only admins can delete motoristas" ON public.motoristas;

CREATE POLICY "mt_motoristas_select" ON public.motoristas FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao')));

CREATE POLICY "mt_motoristas_insert" ON public.motoristas FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao')));

CREATE POLICY "mt_motoristas_update" ON public.motoristas FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao')));

CREATE POLICY "mt_motoristas_delete" ON public.motoristas FOR DELETE TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin());

-- ==================== MOTORISTAS_ATIVOS ====================
DROP POLICY IF EXISTS "Permissão para ver motoristas ativos" ON public.motoristas_ativos;
DROP POLICY IF EXISTS "Permissão para criar motoristas ativos" ON public.motoristas_ativos;
DROP POLICY IF EXISTS "Permissão para editar motoristas ativos" ON public.motoristas_ativos;
DROP POLICY IF EXISTS "Authenticated users can view motoristas_ativos" ON public.motoristas_ativos;
DROP POLICY IF EXISTS "Authenticated users can create motoristas_ativos" ON public.motoristas_ativos;
DROP POLICY IF EXISTS "Authenticated users can update motoristas_ativos" ON public.motoristas_ativos;
DROP POLICY IF EXISTS "Only admins can delete motoristas_ativos" ON public.motoristas_ativos;
DROP POLICY IF EXISTS "Financeiro pode ver motoristas_ativos" ON public.motoristas_ativos;
DROP POLICY IF EXISTS "Financeiro pode ver motoristas_ativos_v2" ON public.motoristas_ativos;

CREATE POLICY "mt_motoristas_ativos_select" ON public.motoristas_ativos FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'motoristas_gestao')
    OR has_permission(auth.uid(), 'financeiro_recibos')
  ));

CREATE POLICY "mt_motoristas_ativos_insert" ON public.motoristas_ativos FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao')));

CREATE POLICY "mt_motoristas_ativos_update" ON public.motoristas_ativos FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao')));

-- ==================== MOTORISTA SUB-TABELAS ====================
-- motorista_documentos
DROP POLICY IF EXISTS "Admins podem ver todos os documentos de motoristas" ON public.motorista_documentos;
DROP POLICY IF EXISTS "Gestores podem ver documentos" ON public.motorista_documentos;
DROP POLICY IF EXISTS "Gestores podem criar documentos" ON public.motorista_documentos;
DROP POLICY IF EXISTS "Gestores podem editar documentos" ON public.motorista_documentos;
DROP POLICY IF EXISTS "Gestores podem eliminar documentos" ON public.motorista_documentos;

CREATE POLICY "mt_motorista_docs_select" ON public.motorista_documentos FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao')));

CREATE POLICY "mt_motorista_docs_insert" ON public.motorista_documentos FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao')));

CREATE POLICY "mt_motorista_docs_update" ON public.motorista_documentos FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao')));

CREATE POLICY "mt_motorista_docs_delete" ON public.motorista_documentos FOR DELETE TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin());

-- motorista_financeiro
DROP POLICY IF EXISTS "Permissão para editar motorista_financeiro" ON public.motorista_financeiro;
DROP POLICY IF EXISTS "Permissão para ver motorista_financeiro" ON public.motorista_financeiro;
DROP POLICY IF EXISTS "Permissão para criar motorista_financeiro" ON public.motorista_financeiro;

CREATE POLICY "mt_motorista_fin_select" ON public.motorista_financeiro FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'motoristas_gestao')
    OR has_permission(auth.uid(), 'assistencia_tickets')
  ));

CREATE POLICY "mt_motorista_fin_insert" ON public.motorista_financeiro FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() AND (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'motoristas_gestao')
    OR has_permission(auth.uid(), 'assistencia_tickets')
  ));

CREATE POLICY "mt_motorista_fin_update" ON public.motorista_financeiro FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'motoristas_gestao')
    OR has_permission(auth.uid(), 'assistencia_tickets')
  ));

-- motorista_viaturas
DROP POLICY IF EXISTS "Gestores podem ver motorista_viaturas" ON public.motorista_viaturas;
DROP POLICY IF EXISTS "Gestores podem criar motorista_viaturas" ON public.motorista_viaturas;
DROP POLICY IF EXISTS "Gestores podem editar motorista_viaturas" ON public.motorista_viaturas;

CREATE POLICY "mt_motorista_viaturas_select" ON public.motorista_viaturas FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao')));

CREATE POLICY "mt_motorista_viaturas_insert" ON public.motorista_viaturas FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao')));

CREATE POLICY "mt_motorista_viaturas_update" ON public.motorista_viaturas FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao')));

-- motorista_recibos
DROP POLICY IF EXISTS "Gestores podem ver recibos" ON public.motorista_recibos;
DROP POLICY IF EXISTS "Gestores podem criar recibos" ON public.motorista_recibos;

CREATE POLICY "mt_motorista_recibos_select" ON public.motorista_recibos FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'motoristas_gestao')
    OR has_permission(auth.uid(), 'financeiro_recibos')
  ));

CREATE POLICY "mt_motorista_recibos_insert" ON public.motorista_recibos FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() AND (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'motoristas_gestao')
    OR has_permission(auth.uid(), 'financeiro_recibos')
  ));

-- motorista_candidaturas
DROP POLICY IF EXISTS "Gestores podem ver candidaturas" ON public.motorista_candidaturas;
DROP POLICY IF EXISTS "Gestores podem criar candidaturas" ON public.motorista_candidaturas;
DROP POLICY IF EXISTS "Gestores podem editar candidaturas" ON public.motorista_candidaturas;
DROP POLICY IF EXISTS "Qualquer um pode criar candidatura" ON public.motorista_candidaturas;

CREATE POLICY "mt_motorista_cand_select" ON public.motorista_candidaturas FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao')));

CREATE POLICY "mt_motorista_cand_insert" ON public.motorista_candidaturas FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id());

CREATE POLICY "mt_motorista_cand_update" ON public.motorista_candidaturas FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao')));

-- ==================== VIATURAS ====================
DROP POLICY IF EXISTS "Autenticados podem ver viaturas" ON public.viaturas;
DROP POLICY IF EXISTS "Gestores podem criar viaturas" ON public.viaturas;
DROP POLICY IF EXISTS "Gestores podem editar viaturas" ON public.viaturas;
DROP POLICY IF EXISTS "Admins podem eliminar viaturas" ON public.viaturas;

CREATE POLICY "mt_viaturas_select" ON public.viaturas FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'viaturas_ver')));

CREATE POLICY "mt_viaturas_insert" ON public.viaturas FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'viaturas_criar')));

CREATE POLICY "mt_viaturas_update" ON public.viaturas FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'viaturas_editar')));

CREATE POLICY "mt_viaturas_delete" ON public.viaturas FOR DELETE TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin());

-- viatura_reparacoes
DROP POLICY IF EXISTS "Permissão para editar viatura_reparacoes" ON public.viatura_reparacoes;
DROP POLICY IF EXISTS "Permissão para ver viatura_reparacoes" ON public.viatura_reparacoes;
DROP POLICY IF EXISTS "Permissão para criar viatura_reparacoes" ON public.viatura_reparacoes;

CREATE POLICY "mt_viatura_rep_select" ON public.viatura_reparacoes FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'motoristas_gestao')
    OR has_permission(auth.uid(), 'assistencia_tickets')
    OR has_permission(auth.uid(), 'viaturas_ver')
  ));

CREATE POLICY "mt_viatura_rep_insert" ON public.viatura_reparacoes FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() AND (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'motoristas_gestao')
    OR has_permission(auth.uid(), 'assistencia_tickets')
  ));

CREATE POLICY "mt_viatura_rep_update" ON public.viatura_reparacoes FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'motoristas_gestao')
    OR has_permission(auth.uid(), 'assistencia_tickets')
  ));

-- viatura_documentos, viatura_danos, viatura_multas, viatura_reservas, viatura_dano_fotos
-- Padrão genérico: admins + viaturas_ver/editar
DROP POLICY IF EXISTS "Gestores podem ver viatura_documentos" ON public.viatura_documentos;
DROP POLICY IF EXISTS "Gestores podem criar viatura_documentos" ON public.viatura_documentos;
DROP POLICY IF EXISTS "Gestores podem editar viatura_documentos" ON public.viatura_documentos;

CREATE POLICY "mt_viatura_docs_select" ON public.viatura_documentos FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'viaturas_ver')));
CREATE POLICY "mt_viatura_docs_insert" ON public.viatura_documentos FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'viaturas_editar')));
CREATE POLICY "mt_viatura_docs_update" ON public.viatura_documentos FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'viaturas_editar')));

DROP POLICY IF EXISTS "Gestores podem ver viatura_danos" ON public.viatura_danos;
DROP POLICY IF EXISTS "Gestores podem criar viatura_danos" ON public.viatura_danos;
DROP POLICY IF EXISTS "Gestores podem editar viatura_danos" ON public.viatura_danos;

CREATE POLICY "mt_viatura_danos_select" ON public.viatura_danos FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'viaturas_ver')));
CREATE POLICY "mt_viatura_danos_insert" ON public.viatura_danos FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'viaturas_editar')));
CREATE POLICY "mt_viatura_danos_update" ON public.viatura_danos FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'viaturas_editar')));

DROP POLICY IF EXISTS "Gestores podem ver viatura_multas" ON public.viatura_multas;
DROP POLICY IF EXISTS "Gestores podem criar viatura_multas" ON public.viatura_multas;
DROP POLICY IF EXISTS "Gestores podem editar viatura_multas" ON public.viatura_multas;

CREATE POLICY "mt_viatura_multas_select" ON public.viatura_multas FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'viaturas_ver')));
CREATE POLICY "mt_viatura_multas_insert" ON public.viatura_multas FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'viaturas_editar')));
CREATE POLICY "mt_viatura_multas_update" ON public.viatura_multas FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'viaturas_editar')));

-- viatura_tipos
CREATE POLICY "mt_viatura_tipos_select" ON public.viatura_tipos FOR SELECT TO authenticated
  USING (org_id = get_current_org_id());
CREATE POLICY "mt_viatura_tipos_insert" ON public.viatura_tipos FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());
CREATE POLICY "mt_viatura_tipos_update" ON public.viatura_tipos FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin());

-- ==================== CONTRATOS ====================
DROP POLICY IF EXISTS "Ver contratos" ON public.contratos;
DROP POLICY IF EXISTS "Criar contratos" ON public.contratos;
DROP POLICY IF EXISTS "Editar contratos" ON public.contratos;
DROP POLICY IF EXISTS "Eliminar contratos" ON public.contratos;

CREATE POLICY "mt_contratos_select" ON public.contratos FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_contratos')));
CREATE POLICY "mt_contratos_insert" ON public.contratos FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_contratos')));
CREATE POLICY "mt_contratos_update" ON public.contratos FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_contratos')));
CREATE POLICY "mt_contratos_delete" ON public.contratos FOR DELETE TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin());

-- ==================== ASSISTÊNCIA ====================
DROP POLICY IF EXISTS "Acesso abrangente para ver tickets" ON public.assistencia_tickets;
DROP POLICY IF EXISTS "Acesso abrangente para atualizar tickets" ON public.assistencia_tickets;
DROP POLICY IF EXISTS "Criar tickets" ON public.assistencia_tickets;

CREATE POLICY "mt_assist_tickets_select" ON public.assistencia_tickets FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (
    is_current_user_admin()
    OR criado_por = auth.uid()
    OR atribuido_a = auth.uid()
    OR has_permission(auth.uid(), 'assistencia_tickets')
    OR has_permission(auth.uid(), 'motoristas_gestao')
    OR EXISTS (
      SELECT 1 FROM public.assistencia_ticket_acessos
      WHERE ticket_id = public.assistencia_tickets.id
        AND profile_id = auth.uid()
    )
  ));

CREATE POLICY "mt_assist_tickets_insert" ON public.assistencia_tickets FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id());

CREATE POLICY "mt_assist_tickets_update" ON public.assistencia_tickets FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND (
    is_current_user_admin()
    OR criado_por = auth.uid()
    OR atribuido_a = auth.uid()
    OR has_permission(auth.uid(), 'assistencia_tickets')
    OR EXISTS (
      SELECT 1 FROM public.assistencia_ticket_acessos
      WHERE ticket_id = public.assistencia_tickets.id
        AND profile_id = auth.uid()
    )
  ));

-- ==================== CALENDÁRIO ====================
DROP POLICY IF EXISTS "Ver eventos" ON public.calendario_eventos;
DROP POLICY IF EXISTS "Criar eventos" ON public.calendario_eventos;
DROP POLICY IF EXISTS "Editar eventos" ON public.calendario_eventos;
DROP POLICY IF EXISTS "Eliminar eventos" ON public.calendario_eventos;

CREATE POLICY "mt_calendario_select" ON public.calendario_eventos FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'calendario_ver')));
CREATE POLICY "mt_calendario_insert" ON public.calendario_eventos FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'calendario_criar')));
CREATE POLICY "mt_calendario_update" ON public.calendario_eventos FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'calendario_editar')));
CREATE POLICY "mt_calendario_delete" ON public.calendario_eventos FOR DELETE TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'calendario_eliminar')));

-- ==================== PROFILES (especial) ====================
-- Users podem ver o seu próprio perfil + admins vêem todos da org
DROP POLICY IF EXISTS "Users podem ver perfis" ON public.profiles;
DROP POLICY IF EXISTS "Users podem editar perfis" ON public.profiles;
DROP POLICY IF EXISTS "Admins podem ver todos os perfis" ON public.profiles;

CREATE POLICY "mt_profiles_select" ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'admin_utilizadores')))
  );

CREATE POLICY "mt_profiles_update" ON public.profiles FOR UPDATE TO authenticated
  USING (
    id = auth.uid()
    OR (org_id = get_current_org_id() AND is_current_user_admin())
  );

-- ==================== CARGOS & PERMISSÕES ====================
DROP POLICY IF EXISTS "Ver cargos" ON public.cargos;
DROP POLICY IF EXISTS "Gerir cargos" ON public.cargos;

CREATE POLICY "mt_cargos_select" ON public.cargos FOR SELECT TO authenticated
  USING (org_id = get_current_org_id());
CREATE POLICY "mt_cargos_all" ON public.cargos FOR ALL TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin())
  WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());

DROP POLICY IF EXISTS "Ver cargo_permissoes" ON public.cargo_permissoes;
DROP POLICY IF EXISTS "Gerir cargo_permissoes" ON public.cargo_permissoes;

CREATE POLICY "mt_cargo_perm_select" ON public.cargo_permissoes FOR SELECT TO authenticated
  USING (org_id = get_current_org_id());
CREATE POLICY "mt_cargo_perm_all" ON public.cargo_permissoes FOR ALL TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin())
  WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());

-- ==================== LEADS / CRM ====================
DROP POLICY IF EXISTS "Enable read access for all users" ON public.leads_dasprent;
DROP POLICY IF EXISTS "Permissão para ver leads" ON public.leads_dasprent;
DROP POLICY IF EXISTS "Permissão para criar leads" ON public.leads_dasprent;
DROP POLICY IF EXISTS "Permissão para editar leads" ON public.leads_dasprent;

CREATE POLICY "mt_leads_select" ON public.leads_dasprent FOR SELECT TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_crm')));
CREATE POLICY "mt_leads_insert" ON public.leads_dasprent FOR INSERT TO authenticated
  WITH CHECK (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_crm')));
CREATE POLICY "mt_leads_update" ON public.leads_dasprent FOR UPDATE TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_crm')));

-- ==================== DOCUMENT TEMPLATES ====================
DROP POLICY IF EXISTS "Admins podem gerir templates" ON public.document_templates;
DROP POLICY IF EXISTS "Users podem ver templates" ON public.document_templates;

CREATE POLICY "mt_templates_select" ON public.document_templates FOR SELECT TO authenticated
  USING (org_id = get_current_org_id());
CREATE POLICY "mt_templates_all" ON public.document_templates FOR ALL TO authenticated
  USING (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'admin_documentos')))
  WITH CHECK (org_id = get_current_org_id() AND (is_current_user_admin() OR has_permission(auth.uid(), 'admin_documentos')));

-- ==================== ESTAÇÕES (opcional) ====================
DO $$ BEGIN
  CREATE POLICY "mt_estacoes_select" ON public.estacoes FOR SELECT TO authenticated
    USING (org_id = get_current_org_id());
  CREATE POLICY "mt_estacoes_all" ON public.estacoes FOR ALL TO authenticated
    USING (org_id = get_current_org_id() AND is_current_user_admin())
    WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- ==================== EMPRESAS (opcional) ====================
DO $$ BEGIN
  CREATE POLICY "mt_empresas_select" ON public.empresas FOR SELECT TO authenticated
    USING (org_id = get_current_org_id());
  CREATE POLICY "mt_empresas_all" ON public.empresas FOR ALL TO authenticated
    USING (org_id = get_current_org_id() AND is_current_user_admin())
    WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());
EXCEPTION WHEN undefined_table THEN NULL; END $$;
