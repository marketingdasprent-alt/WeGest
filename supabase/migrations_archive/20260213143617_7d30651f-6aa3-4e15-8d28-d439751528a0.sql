
-- Tabela para registar o resultado individual de cada contacto num envio
CREATE TABLE public.marketing_envio_detalhes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  envio_id uuid NOT NULL REFERENCES public.marketing_envios(id) ON DELETE CASCADE,
  contacto_email text NOT NULL,
  contacto_nome text,
  status text NOT NULL DEFAULT 'enviado',
  erro_mensagem text,
  criado_em timestamp with time zone NOT NULL DEFAULT now()
);

-- Índice para consultas por envio
CREATE INDEX idx_marketing_envio_detalhes_envio_id ON public.marketing_envio_detalhes(envio_id);

-- Habilitar RLS
ALTER TABLE public.marketing_envio_detalhes ENABLE ROW LEVEL SECURITY;

-- Leitura para utilizadores autenticados
CREATE POLICY "Utilizadores autenticados podem ver detalhes de envios"
  ON public.marketing_envio_detalhes
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Inserção (service role via edge function)
CREATE POLICY "Service role pode inserir detalhes"
  ON public.marketing_envio_detalhes
  FOR INSERT
  WITH CHECK (true);
