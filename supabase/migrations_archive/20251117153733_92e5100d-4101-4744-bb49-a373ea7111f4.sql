-- Criar tabela de motoristas
CREATE TABLE public.motoristas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
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
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.motoristas ENABLE ROW LEVEL SECURITY;

-- Policy: Todos os usuários autenticados podem visualizar
CREATE POLICY "Authenticated users can view motoristas"
ON public.motoristas
FOR SELECT
TO authenticated
USING (true);

-- Policy: Todos os usuários autenticados podem criar
CREATE POLICY "Authenticated users can create motoristas"
ON public.motoristas
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy: Todos os usuários autenticados podem atualizar
CREATE POLICY "Authenticated users can update motoristas"
ON public.motoristas
FOR UPDATE
TO authenticated
USING (true);

-- Policy: Apenas admins podem deletar
CREATE POLICY "Only admins can delete motoristas"
ON public.motoristas
FOR DELETE
TO authenticated
USING (is_current_user_admin());

-- Trigger para atualizar updated_at automaticamente
CREATE TRIGGER update_motoristas_updated_at
BEFORE UPDATE ON public.motoristas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();