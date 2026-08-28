-- Criar tabela motoristas_ativos para motoristas contratados
CREATE TABLE public.motoristas_ativos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  nif TEXT,
  documento_tipo TEXT,
  documento_numero TEXT,
  documento_validade DATE,
  carta_conducao TEXT,
  carta_categorias TEXT[],
  carta_validade DATE,
  morada TEXT,
  email TEXT,
  telefone TEXT,
  data_contratacao DATE,
  status_ativo BOOLEAN DEFAULT true,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.motoristas_ativos ENABLE ROW LEVEL SECURITY;

-- Policy para SELECT - usuários autenticados podem visualizar
CREATE POLICY "Authenticated users can view motoristas_ativos"
ON public.motoristas_ativos
FOR SELECT
TO authenticated
USING (true);

-- Policy para INSERT - usuários autenticados podem criar
CREATE POLICY "Authenticated users can create motoristas_ativos"
ON public.motoristas_ativos
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy para UPDATE - usuários autenticados podem atualizar
CREATE POLICY "Authenticated users can update motoristas_ativos"
ON public.motoristas_ativos
FOR UPDATE
TO authenticated
USING (true);

-- Policy para DELETE - apenas admins podem deletar
CREATE POLICY "Only admins can delete motoristas_ativos"
ON public.motoristas_ativos
FOR DELETE
TO authenticated
USING (is_current_user_admin());

-- Trigger para atualizar updated_at automaticamente
CREATE TRIGGER update_motoristas_ativos_updated_at
BEFORE UPDATE ON public.motoristas_ativos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Criar índices para melhor performance
CREATE INDEX idx_motoristas_ativos_nome ON public.motoristas_ativos(nome);
CREATE INDEX idx_motoristas_ativos_email ON public.motoristas_ativos(email);
CREATE INDEX idx_motoristas_ativos_status ON public.motoristas_ativos(status_ativo);
CREATE INDEX idx_motoristas_ativos_data_contratacao ON public.motoristas_ativos(data_contratacao);