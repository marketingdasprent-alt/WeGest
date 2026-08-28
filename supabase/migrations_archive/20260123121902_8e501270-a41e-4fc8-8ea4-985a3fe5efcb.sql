-- =====================================================
-- FASE 1: REESTRUTURAÇÃO DO SISTEMA DE MOTORISTAS
-- =====================================================

-- 1.1 Criar tabela de candidaturas de motoristas
CREATE TABLE public.motorista_candidaturas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  
  -- Dados pessoais
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT,
  nif TEXT,
  morada TEXT,
  cidade TEXT,
  
  -- Documentos de identificação
  documento_tipo TEXT,
  documento_numero TEXT,
  documento_validade DATE,
  documento_ficheiro_url TEXT,
  
  -- Carta de condução
  carta_conducao TEXT,
  carta_categorias TEXT[],
  carta_validade DATE,
  carta_ficheiro_url TEXT,
  
  -- Licença TVDE
  licenca_tvde_numero TEXT,
  licenca_tvde_validade DATE,
  licenca_tvde_ficheiro_url TEXT,
  
  -- Outros documentos (array de {nome, url, tipo})
  outros_documentos JSONB DEFAULT '[]',
  
  -- Status da candidatura
  status TEXT DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'submetido', 'em_analise', 'aprovado', 'rejeitado')),
  data_submissao TIMESTAMPTZ,
  data_decisao TIMESTAMPTZ,
  motivo_rejeicao TEXT,
  decidido_por UUID REFERENCES auth.users(id),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 1.2 Índices para performance
CREATE INDEX idx_motorista_candidaturas_user_id ON public.motorista_candidaturas(user_id);
CREATE INDEX idx_motorista_candidaturas_status ON public.motorista_candidaturas(status);
CREATE INDEX idx_motorista_candidaturas_email ON public.motorista_candidaturas(email);

-- 1.3 Trigger para atualizar updated_at
CREATE TRIGGER update_motorista_candidaturas_updated_at
  BEFORE UPDATE ON public.motorista_candidaturas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 1.4 Habilitar RLS
ALTER TABLE public.motorista_candidaturas ENABLE ROW LEVEL SECURITY;

-- 1.5 Políticas RLS para motorista_candidaturas

-- Motoristas podem ver apenas sua própria candidatura
CREATE POLICY "Motoristas podem ver sua candidatura"
  ON public.motorista_candidaturas
  FOR SELECT
  USING (auth.uid() = user_id);

-- Motoristas podem criar sua própria candidatura
CREATE POLICY "Motoristas podem criar sua candidatura"
  ON public.motorista_candidaturas
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Motoristas podem atualizar sua candidatura (apenas se em rascunho ou submetido)
CREATE POLICY "Motoristas podem atualizar sua candidatura"
  ON public.motorista_candidaturas
  FOR UPDATE
  USING (auth.uid() = user_id AND status IN ('rascunho', 'submetido'));

-- Admins podem ver todas as candidaturas
CREATE POLICY "Admins podem ver todas as candidaturas"
  ON public.motorista_candidaturas
  FOR SELECT
  USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

-- Admins podem atualizar qualquer candidatura (aprovar/rejeitar)
CREATE POLICY "Admins podem atualizar candidaturas"
  ON public.motorista_candidaturas
  FOR UPDATE
  USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

-- Admins podem deletar candidaturas
CREATE POLICY "Admins podem deletar candidaturas"
  ON public.motorista_candidaturas
  FOR DELETE
  USING (is_current_user_admin());

-- =====================================================
-- 1.6 Criar bucket de storage para documentos
-- =====================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'motorista-documentos',
  'motorista-documentos',
  false,
  10485760, -- 10MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
);

-- Políticas de storage

-- Motoristas podem fazer upload dos seus próprios documentos
CREATE POLICY "Motoristas podem fazer upload dos seus documentos"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'motorista-documentos' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Motoristas podem ver os seus próprios documentos
CREATE POLICY "Motoristas podem ver os seus documentos"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'motorista-documentos' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Motoristas podem atualizar os seus próprios documentos
CREATE POLICY "Motoristas podem atualizar os seus documentos"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'motorista-documentos' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Motoristas podem deletar os seus próprios documentos
CREATE POLICY "Motoristas podem deletar os seus documentos"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'motorista-documentos' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Admins podem ver todos os documentos
CREATE POLICY "Admins podem ver todos os documentos de motoristas"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'motorista-documentos' 
    AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'))
  );

-- =====================================================
-- 1.7 Adicionar cargo "Motorista" e recurso
-- =====================================================

-- Inserir novo cargo para motoristas
INSERT INTO public.cargos (id, nome, descricao)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Motorista',
  'Cargo para motoristas candidatos e em frota'
);

-- Inserir novo recurso para painel do motorista
INSERT INTO public.recursos (nome, descricao, categoria)
VALUES (
  'motorista_painel',
  'Acesso ao painel exclusivo do motorista',
  'Motoristas'
);

-- Dar permissão do painel ao cargo Motorista
INSERT INTO public.cargo_permissoes (cargo_id, recurso_id, tem_acesso)
SELECT 
  'a0000000-0000-0000-0000-000000000001',
  id,
  true
FROM public.recursos
WHERE nome = 'motorista_painel';

-- =====================================================
-- 1.8 Função para aprovar candidatura
-- =====================================================
CREATE OR REPLACE FUNCTION public.aprovar_candidatura_motorista(
  p_candidatura_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidatura RECORD;
  v_motorista_id UUID;
BEGIN
  -- Verificar se é admin ou tem permissão
  IF NOT (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao')) THEN
    RAISE EXCEPTION 'Sem permissão para aprovar candidaturas';
  END IF;

  -- Buscar candidatura
  SELECT * INTO v_candidatura
  FROM motorista_candidaturas
  WHERE id = p_candidatura_id AND status IN ('submetido', 'em_analise');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidatura não encontrada ou não está pendente';
  END IF;

  -- Criar motorista ativo
  INSERT INTO motoristas_ativos (
    nome, email, telefone, nif, morada, cidade,
    documento_tipo, documento_numero, documento_validade,
    carta_conducao, carta_categorias, carta_validade,
    licenca_tvde_numero, licenca_tvde_validade,
    status_ativo, data_contratacao
  )
  VALUES (
    v_candidatura.nome,
    v_candidatura.email,
    v_candidatura.telefone,
    v_candidatura.nif,
    v_candidatura.morada,
    v_candidatura.cidade,
    v_candidatura.documento_tipo,
    v_candidatura.documento_numero,
    v_candidatura.documento_validade,
    v_candidatura.carta_conducao,
    v_candidatura.carta_categorias,
    v_candidatura.carta_validade,
    v_candidatura.licenca_tvde_numero,
    v_candidatura.licenca_tvde_validade,
    false, -- Começa inativo até assinar contrato
    CURRENT_DATE
  )
  RETURNING id INTO v_motorista_id;

  -- Atualizar status da candidatura
  UPDATE motorista_candidaturas
  SET 
    status = 'aprovado',
    data_decisao = now(),
    decidido_por = auth.uid()
  WHERE id = p_candidatura_id;

  RETURN v_motorista_id;
END;
$$;

-- =====================================================
-- 1.9 Função para rejeitar candidatura
-- =====================================================
CREATE OR REPLACE FUNCTION public.rejeitar_candidatura_motorista(
  p_candidatura_id UUID,
  p_motivo TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verificar se é admin ou tem permissão
  IF NOT (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao')) THEN
    RAISE EXCEPTION 'Sem permissão para rejeitar candidaturas';
  END IF;

  -- Atualizar status da candidatura
  UPDATE motorista_candidaturas
  SET 
    status = 'rejeitado',
    data_decisao = now(),
    decidido_por = auth.uid(),
    motivo_rejeicao = p_motivo
  WHERE id = p_candidatura_id AND status IN ('submetido', 'em_analise');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidatura não encontrada ou não está pendente';
  END IF;

  RETURN true;
END;
$$;