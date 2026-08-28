-- Tabela principal de contratos
CREATE TABLE contratos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  motorista_id UUID NOT NULL REFERENCES motoristas_ativos(id) ON DELETE CASCADE,
  empresa_id TEXT NOT NULL,
  
  -- Dados do contrato
  data_inicio DATE NOT NULL,
  data_assinatura DATE NOT NULL,
  cidade_assinatura TEXT NOT NULL,
  duracao_meses INTEGER DEFAULT 12,
  
  -- Dados do motorista (snapshot no momento da geração)
  motorista_nome TEXT NOT NULL,
  motorista_nif TEXT,
  motorista_documento_tipo TEXT,
  motorista_documento_numero TEXT,
  motorista_morada TEXT,
  motorista_email TEXT,
  motorista_telefone TEXT,
  
  -- Status do contrato
  status TEXT DEFAULT 'ativo',
  
  -- Metadados
  criado_por UUID,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT contratos_empresa_check CHECK (empresa_id IN ('decada_ousada', 'distancia_arrojada'))
);

-- Tabela de histórico de reimpressão
CREATE TABLE contratos_reimpressoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  reimpresso_por UUID,
  reimpresso_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
  motivo TEXT
);

-- Tabela de histórico de edições
CREATE TABLE contratos_edicoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  editado_por UUID,
  editado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
  campos_alterados JSONB NOT NULL,
  observacoes TEXT
);

-- Índices
CREATE INDEX idx_contratos_motorista ON contratos(motorista_id);
CREATE INDEX idx_contratos_status ON contratos(status);
CREATE INDEX idx_contratos_criado_em ON contratos(criado_em DESC);

-- RLS Policies
ALTER TABLE contratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE contratos_reimpressoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE contratos_edicoes ENABLE ROW LEVEL SECURITY;

-- Permissões para ver contratos
CREATE POLICY "Permissão para ver contratos" ON contratos
  FOR SELECT USING (
    is_current_user_admin() OR 
    has_permission(auth.uid(), 'motoristas_contratos')
  );

-- Permissões para criar contratos
CREATE POLICY "Permissão para criar contratos" ON contratos
  FOR INSERT WITH CHECK (
    is_current_user_admin() OR 
    has_permission(auth.uid(), 'motoristas_contratos')
  );

-- Permissões para editar contratos
CREATE POLICY "Permissão para editar contratos" ON contratos
  FOR UPDATE USING (
    is_current_user_admin() OR 
    has_permission(auth.uid(), 'motoristas_contratos')
  );

-- Permissões para ver histórico
CREATE POLICY "Ver histórico de reimpressões" ON contratos_reimpressoes
  FOR SELECT USING (
    is_current_user_admin() OR 
    has_permission(auth.uid(), 'motoristas_contratos')
  );

CREATE POLICY "Ver histórico de edições" ON contratos_edicoes
  FOR SELECT USING (
    is_current_user_admin() OR 
    has_permission(auth.uid(), 'motoristas_contratos')
  );

-- Todos podem inserir nos históricos
CREATE POLICY "Inserir reimpressões" ON contratos_reimpressoes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Inserir edições" ON contratos_edicoes
  FOR INSERT WITH CHECK (true);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_contratos_updated_at
  BEFORE UPDATE ON contratos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();