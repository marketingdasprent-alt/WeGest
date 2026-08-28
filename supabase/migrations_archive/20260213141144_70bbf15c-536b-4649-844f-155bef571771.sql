
CREATE TABLE public.marketing_envios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campanha_id UUID NOT NULL REFERENCES public.marketing_campanhas(id) ON DELETE CASCADE,
  lista_id UUID REFERENCES public.marketing_listas(id) ON DELETE SET NULL,
  assinatura_id UUID REFERENCES public.marketing_assinaturas(id) ON DELETE SET NULL,
  total_enviados INTEGER NOT NULL DEFAULT 0,
  total_erros INTEGER NOT NULL DEFAULT 0,
  enviado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  enviado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_envios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view envios"
  ON public.marketing_envios FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert envios"
  ON public.marketing_envios FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
