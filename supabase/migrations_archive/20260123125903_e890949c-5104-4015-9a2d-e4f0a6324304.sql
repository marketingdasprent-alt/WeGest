-- =============================================
-- Tabela: viaturas (Frota de veículos)
-- =============================================
CREATE TABLE public.viaturas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matricula TEXT UNIQUE NOT NULL,
  marca TEXT NOT NULL,
  modelo TEXT NOT NULL,
  ano INTEGER,
  cor TEXT,
  categoria TEXT, -- 'Comfort', 'Black', 'Green', 'X-Saver'
  combustivel TEXT, -- 'Gasolina', 'Diesel', 'Elétrico', 'Híbrido'
  status TEXT DEFAULT 'disponivel', -- 'disponivel', 'em_uso', 'manutencao', 'inativo'
  km_atual INTEGER DEFAULT 0,
  seguro_numero TEXT,
  seguro_validade DATE,
  inspecao_validade DATE,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS para viaturas
ALTER TABLE public.viaturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permissão para ver viaturas"
ON public.viaturas FOR SELECT
USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

CREATE POLICY "Permissão para criar viaturas"
ON public.viaturas FOR INSERT
WITH CHECK (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

CREATE POLICY "Permissão para editar viaturas"
ON public.viaturas FOR UPDATE
USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

CREATE POLICY "Apenas admins podem deletar viaturas"
ON public.viaturas FOR DELETE
USING (is_current_user_admin());

-- =============================================
-- Tabela: motorista_viaturas (Associação/Histórico)
-- =============================================
CREATE TABLE public.motorista_viaturas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  motorista_id UUID NOT NULL REFERENCES public.motoristas_ativos(id) ON DELETE CASCADE,
  viatura_id UUID NOT NULL REFERENCES public.viaturas(id) ON DELETE CASCADE,
  data_inicio DATE NOT NULL,
  data_fim DATE, -- NULL = associação atual
  status TEXT DEFAULT 'ativo', -- 'ativo', 'encerrado'
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS para motorista_viaturas
ALTER TABLE public.motorista_viaturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permissão para ver motorista_viaturas"
ON public.motorista_viaturas FOR SELECT
USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

CREATE POLICY "Permissão para criar motorista_viaturas"
ON public.motorista_viaturas FOR INSERT
WITH CHECK (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

CREATE POLICY "Permissão para editar motorista_viaturas"
ON public.motorista_viaturas FOR UPDATE
USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

CREATE POLICY "Apenas admins podem deletar motorista_viaturas"
ON public.motorista_viaturas FOR DELETE
USING (is_current_user_admin());

-- =============================================
-- Tabela: motorista_documentos (Ficheiros Anexados)
-- =============================================
CREATE TABLE public.motorista_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  motorista_id UUID NOT NULL REFERENCES public.motoristas_ativos(id) ON DELETE CASCADE,
  tipo_documento TEXT NOT NULL, -- 'cartao_cidadao', 'carta_conducao', 'licenca_tvde', 'comprovativo_morada', 'registo_criminal', 'outros'
  nome_ficheiro TEXT,
  ficheiro_url TEXT NOT NULL,
  data_validade DATE,
  observacoes TEXT,
  uploaded_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS para motorista_documentos
ALTER TABLE public.motorista_documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permissão para ver motorista_documentos"
ON public.motorista_documentos FOR SELECT
USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

CREATE POLICY "Permissão para criar motorista_documentos"
ON public.motorista_documentos FOR INSERT
WITH CHECK (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

CREATE POLICY "Permissão para editar motorista_documentos"
ON public.motorista_documentos FOR UPDATE
USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

CREATE POLICY "Permissão para deletar motorista_documentos"
ON public.motorista_documentos FOR DELETE
USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

-- =============================================
-- Tabela: motorista_financeiro (Movimentos Financeiros)
-- =============================================
CREATE TABLE public.motorista_financeiro (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  motorista_id UUID NOT NULL REFERENCES public.motoristas_ativos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('credito', 'debito')),
  categoria TEXT, -- 'salario', 'bonus', 'desconto', 'multa', 'caucao', 'renda_viatura', 'outro'
  descricao TEXT NOT NULL,
  valor DECIMAL(10,2) NOT NULL,
  data_movimento DATE NOT NULL,
  data_pagamento DATE, -- quando foi pago (se aplicável)
  status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'cancelado')),
  referencia TEXT, -- número de fatura, etc.
  criado_por UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS para motorista_financeiro
ALTER TABLE public.motorista_financeiro ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permissão para ver motorista_financeiro"
ON public.motorista_financeiro FOR SELECT
USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

CREATE POLICY "Permissão para criar motorista_financeiro"
ON public.motorista_financeiro FOR INSERT
WITH CHECK (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

CREATE POLICY "Permissão para editar motorista_financeiro"
ON public.motorista_financeiro FOR UPDATE
USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

CREATE POLICY "Apenas admins podem deletar motorista_financeiro"
ON public.motorista_financeiro FOR DELETE
USING (is_current_user_admin());

-- =============================================
-- Índices para performance
-- =============================================
CREATE INDEX idx_motorista_viaturas_motorista ON public.motorista_viaturas(motorista_id);
CREATE INDEX idx_motorista_viaturas_viatura ON public.motorista_viaturas(viatura_id);
CREATE INDEX idx_motorista_viaturas_status ON public.motorista_viaturas(status);

CREATE INDEX idx_motorista_documentos_motorista ON public.motorista_documentos(motorista_id);
CREATE INDEX idx_motorista_documentos_tipo ON public.motorista_documentos(tipo_documento);

CREATE INDEX idx_motorista_financeiro_motorista ON public.motorista_financeiro(motorista_id);
CREATE INDEX idx_motorista_financeiro_status ON public.motorista_financeiro(status);
CREATE INDEX idx_motorista_financeiro_data ON public.motorista_financeiro(data_movimento);

CREATE INDEX idx_viaturas_status ON public.viaturas(status);
CREATE INDEX idx_viaturas_matricula ON public.viaturas(matricula);