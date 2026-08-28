
-- Tabela de listas de transmissão
CREATE TABLE public.marketing_listas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  criado_por UUID REFERENCES auth.users(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_listas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Utilizadores autenticados podem ver listas" ON public.marketing_listas
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Utilizadores autenticados podem criar listas" ON public.marketing_listas
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Utilizadores autenticados podem editar listas" ON public.marketing_listas
  FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Utilizadores autenticados podem eliminar listas" ON public.marketing_listas
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- Tabela de contactos
CREATE TABLE public.marketing_contactos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lista_id UUID NOT NULL REFERENCES public.marketing_listas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(lista_id, email)
);

ALTER TABLE public.marketing_contactos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Utilizadores autenticados podem ver contactos" ON public.marketing_contactos
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Utilizadores autenticados podem criar contactos" ON public.marketing_contactos
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Utilizadores autenticados podem editar contactos" ON public.marketing_contactos
  FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Utilizadores autenticados podem eliminar contactos" ON public.marketing_contactos
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- Tabela de campanhas
CREATE TABLE public.marketing_campanhas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  assunto TEXT NOT NULL DEFAULT '',
  conteudo_html TEXT NOT NULL DEFAULT '',
  lista_id UUID REFERENCES public.marketing_listas(id),
  status TEXT NOT NULL DEFAULT 'rascunho',
  total_enviados INTEGER NOT NULL DEFAULT 0,
  total_erros INTEGER NOT NULL DEFAULT 0,
  enviado_em TIMESTAMPTZ,
  criado_por UUID REFERENCES auth.users(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_campanhas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Utilizadores autenticados podem ver campanhas" ON public.marketing_campanhas
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Utilizadores autenticados podem criar campanhas" ON public.marketing_campanhas
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Utilizadores autenticados podem editar campanhas" ON public.marketing_campanhas
  FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Utilizadores autenticados podem eliminar campanhas" ON public.marketing_campanhas
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- Recurso de permissão
INSERT INTO public.recursos (nome, descricao, categoria)
VALUES ('marketing_ver', 'Acesso ao módulo de Marketing', 'Marketing')
ON CONFLICT (nome) DO NOTHING;

-- Trigger updated_at para listas
CREATE TRIGGER update_marketing_listas_updated_at
  BEFORE UPDATE ON public.marketing_listas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
