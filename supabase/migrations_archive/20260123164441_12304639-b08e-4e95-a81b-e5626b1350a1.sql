-- Adicionar novas colunas à tabela viaturas
ALTER TABLE viaturas 
ADD COLUMN IF NOT EXISTS numero_motor text,
ADD COLUMN IF NOT EXISTS numero_chassis text,
ADD COLUMN IF NOT EXISTS data_matricula date,
ADD COLUMN IF NOT EXISTS seguradora text,
ADD COLUMN IF NOT EXISTS obe_numero text,
ADD COLUMN IF NOT EXISTS obe_estado text DEFAULT 'ativo';

-- Criar tabela viatura_documentos
CREATE TABLE IF NOT EXISTS viatura_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viatura_id uuid NOT NULL REFERENCES viaturas(id) ON DELETE CASCADE,
  tipo_documento text NOT NULL,
  nome_ficheiro text,
  ficheiro_url text NOT NULL,
  data_validade date,
  observacoes text,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Criar tabela viatura_danos
CREATE TABLE IF NOT EXISTS viatura_danos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viatura_id uuid NOT NULL REFERENCES viaturas(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  localizacao text,
  data_registo date DEFAULT CURRENT_DATE,
  estado text DEFAULT 'pendente',
  observacoes text,
  registado_por uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Criar tabela viatura_reparacoes
CREATE TABLE IF NOT EXISTS viatura_reparacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viatura_id uuid NOT NULL REFERENCES viaturas(id) ON DELETE CASCADE,
  dano_id uuid REFERENCES viatura_danos(id) ON DELETE SET NULL,
  descricao text NOT NULL,
  oficina text,
  custo decimal(10,2),
  data_entrada date,
  data_saida date,
  km_entrada integer,
  observacoes text,
  registado_por uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Criar tabela viatura_multas
CREATE TABLE IF NOT EXISTS viatura_multas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viatura_id uuid NOT NULL REFERENCES viaturas(id) ON DELETE CASCADE,
  motorista_id uuid REFERENCES motoristas_ativos(id) ON DELETE SET NULL,
  data_infracao date NOT NULL,
  descricao text,
  valor decimal(10,2),
  estado text DEFAULT 'pendente',
  data_pagamento date,
  observacoes text,
  registado_por uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Criar tabela viatura_reservas
CREATE TABLE IF NOT EXISTS viatura_reservas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viatura_id uuid NOT NULL REFERENCES viaturas(id) ON DELETE CASCADE,
  motorista_id uuid REFERENCES motoristas_ativos(id) ON DELETE SET NULL,
  data_inicio date NOT NULL,
  data_fim date,
  motivo text,
  estado text DEFAULT 'ativa',
  criado_por uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Habilitar RLS em todas as novas tabelas
ALTER TABLE viatura_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE viatura_danos ENABLE ROW LEVEL SECURITY;
ALTER TABLE viatura_reparacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE viatura_multas ENABLE ROW LEVEL SECURITY;
ALTER TABLE viatura_reservas ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para viatura_documentos
CREATE POLICY "Permissão para ver viatura_documentos" ON viatura_documentos
  FOR SELECT USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

CREATE POLICY "Permissão para criar viatura_documentos" ON viatura_documentos
  FOR INSERT WITH CHECK (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

CREATE POLICY "Permissão para editar viatura_documentos" ON viatura_documentos
  FOR UPDATE USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

CREATE POLICY "Permissão para deletar viatura_documentos" ON viatura_documentos
  FOR DELETE USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

-- Políticas RLS para viatura_danos
CREATE POLICY "Permissão para ver viatura_danos" ON viatura_danos
  FOR SELECT USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

CREATE POLICY "Permissão para criar viatura_danos" ON viatura_danos
  FOR INSERT WITH CHECK (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

CREATE POLICY "Permissão para editar viatura_danos" ON viatura_danos
  FOR UPDATE USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

CREATE POLICY "Apenas admins podem deletar viatura_danos" ON viatura_danos
  FOR DELETE USING (is_current_user_admin());

-- Políticas RLS para viatura_reparacoes
CREATE POLICY "Permissão para ver viatura_reparacoes" ON viatura_reparacoes
  FOR SELECT USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

CREATE POLICY "Permissão para criar viatura_reparacoes" ON viatura_reparacoes
  FOR INSERT WITH CHECK (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

CREATE POLICY "Permissão para editar viatura_reparacoes" ON viatura_reparacoes
  FOR UPDATE USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

CREATE POLICY "Apenas admins podem deletar viatura_reparacoes" ON viatura_reparacoes
  FOR DELETE USING (is_current_user_admin());

-- Políticas RLS para viatura_multas
CREATE POLICY "Permissão para ver viatura_multas" ON viatura_multas
  FOR SELECT USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

CREATE POLICY "Permissão para criar viatura_multas" ON viatura_multas
  FOR INSERT WITH CHECK (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

CREATE POLICY "Permissão para editar viatura_multas" ON viatura_multas
  FOR UPDATE USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

CREATE POLICY "Apenas admins podem deletar viatura_multas" ON viatura_multas
  FOR DELETE USING (is_current_user_admin());

-- Políticas RLS para viatura_reservas
CREATE POLICY "Permissão para ver viatura_reservas" ON viatura_reservas
  FOR SELECT USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

CREATE POLICY "Permissão para criar viatura_reservas" ON viatura_reservas
  FOR INSERT WITH CHECK (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

CREATE POLICY "Permissão para editar viatura_reservas" ON viatura_reservas
  FOR UPDATE USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

CREATE POLICY "Permissão para deletar viatura_reservas" ON viatura_reservas
  FOR DELETE USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

-- Criar bucket para documentos de viaturas
INSERT INTO storage.buckets (id, name, public)
VALUES ('viatura-documentos', 'viatura-documentos', false)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage para viatura-documentos
CREATE POLICY "Permissão para ver ficheiros viatura-documentos" ON storage.objects
  FOR SELECT USING (bucket_id = 'viatura-documentos' AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao')));

CREATE POLICY "Permissão para upload viatura-documentos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'viatura-documentos' AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao')));

CREATE POLICY "Permissão para update viatura-documentos" ON storage.objects
  FOR UPDATE USING (bucket_id = 'viatura-documentos' AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao')));

CREATE POLICY "Permissão para delete viatura-documentos" ON storage.objects
  FOR DELETE USING (bucket_id = 'viatura-documentos' AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao')));