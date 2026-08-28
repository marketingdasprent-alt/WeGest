
-- Criar tabela de assinaturas de email
CREATE TABLE public.marketing_assinaturas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  conteudo_html TEXT NOT NULL DEFAULT '',
  criado_por UUID REFERENCES auth.users(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.marketing_assinaturas ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Utilizadores autenticados podem ver assinaturas"
  ON public.marketing_assinaturas FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Utilizadores autenticados podem criar assinaturas"
  ON public.marketing_assinaturas FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Utilizadores autenticados podem editar assinaturas"
  ON public.marketing_assinaturas FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Utilizadores autenticados podem eliminar assinaturas"
  ON public.marketing_assinaturas FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Trigger para atualizar timestamp
CREATE TRIGGER update_marketing_assinaturas_updated_at
  BEFORE UPDATE ON public.marketing_assinaturas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Adicionar coluna assinatura_id na tabela de campanhas
ALTER TABLE public.marketing_campanhas
  ADD COLUMN assinatura_id UUID REFERENCES public.marketing_assinaturas(id) ON DELETE SET NULL;
