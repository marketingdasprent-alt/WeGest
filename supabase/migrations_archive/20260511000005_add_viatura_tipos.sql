-- Tabela de tipos de viatura (gerível pela administração)
CREATE TABLE IF NOT EXISTS public.viatura_tipos (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome      TEXT        NOT NULL,
  ativo     BOOLEAN     NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.viatura_tipos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "viatura_tipos_select" ON public.viatura_tipos FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "viatura_tipos_all_admin" ON public.viatura_tipos FOR ALL TO authenticated
    USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tipos por defeito
INSERT INTO public.viatura_tipos (nome) VALUES
  ('Ligeira TVDE'),
  ('Comercial'),
  ('Ligeira RENT')
ON CONFLICT DO NOTHING;

-- Coluna na tabela viaturas
ALTER TABLE public.viaturas
  ADD COLUMN IF NOT EXISTS tipo_id UUID REFERENCES public.viatura_tipos(id) ON DELETE SET NULL;
