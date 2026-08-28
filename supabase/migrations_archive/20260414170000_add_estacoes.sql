-- Tabela de estações
CREATE TABLE IF NOT EXISTS public.estacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  morada text,
  cidade text,
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.estacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read estacoes"
  ON public.estacoes FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage estacoes"
  ON public.estacoes FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- FK on viaturas
ALTER TABLE public.viaturas
  ADD COLUMN IF NOT EXISTS estacao_id uuid REFERENCES public.estacoes(id) ON DELETE SET NULL;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS set_estacoes_updated_at ON public.estacoes;
CREATE TRIGGER set_estacoes_updated_at
  BEFORE UPDATE ON public.estacoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
