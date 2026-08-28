-- Adicionar campos à viatura_danos para ligação motorista/contrato
ALTER TABLE viatura_danos
ADD COLUMN IF NOT EXISTS motorista_id uuid REFERENCES motoristas_ativos(id),
ADD COLUMN IF NOT EXISTS contrato_id uuid REFERENCES contratos(id),
ADD COLUMN IF NOT EXISTS valor numeric(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS valor_cobrado numeric(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS data_ocorrencia date;

-- Criar tabela de fotos de danos
CREATE TABLE IF NOT EXISTS viatura_dano_fotos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dano_id uuid NOT NULL REFERENCES viatura_danos(id) ON DELETE CASCADE,
  ficheiro_url text NOT NULL,
  nome_ficheiro text,
  descricao text,
  uploaded_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

-- Adicionar dano_id ao financeiro para referência cruzada
ALTER TABLE motorista_financeiro
ADD COLUMN IF NOT EXISTS dano_id uuid REFERENCES viatura_danos(id);

-- RLS para viatura_dano_fotos
ALTER TABLE viatura_dano_fotos ENABLE ROW LEVEL SECURITY;

-- Políticas para fotos de danos
CREATE POLICY "Permissão para ver fotos de danos" ON viatura_dano_fotos
FOR SELECT TO authenticated
USING (
  is_current_user_admin() 
  OR has_permission(auth.uid(), 'viaturas_ver')
  OR has_permission(auth.uid(), 'motoristas_gestao')
);

CREATE POLICY "Permissão para criar fotos de danos" ON viatura_dano_fotos
FOR INSERT TO authenticated
WITH CHECK (
  is_current_user_admin() 
  OR has_permission(auth.uid(), 'viaturas_criar')
  OR has_permission(auth.uid(), 'motoristas_gestao')
);

CREATE POLICY "Permissão para deletar fotos de danos" ON viatura_dano_fotos
FOR DELETE TO authenticated
USING (
  is_current_user_admin() 
  OR has_permission(auth.uid(), 'motoristas_gestao')
);

-- Política para motoristas verem fotos dos seus próprios danos
CREATE POLICY "Motoristas podem ver fotos dos seus danos" ON viatura_dano_fotos
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM viatura_danos d
    JOIN motoristas_ativos m ON m.id = d.motorista_id
    WHERE d.id = viatura_dano_fotos.dano_id
    AND m.user_id = auth.uid()
  )
);