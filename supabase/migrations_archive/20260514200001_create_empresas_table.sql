-- Criar tabela empresas
CREATE TABLE IF NOT EXISTS public.empresas (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  nome_completo TEXT NOT NULL,
  nif TEXT,
  sede TEXT,
  licenca_tvde TEXT,
  licenca_validade TEXT,
  representante TEXT,
  cargo_representante TEXT,
  papel_timbrado TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  org_id UUID REFERENCES public.organizacoes(id)
);

-- RLS
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "empresas_select" ON public.empresas
  FOR SELECT USING (true);

CREATE POLICY "empresas_admin" ON public.empresas
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- Inserir as duas empresas
INSERT INTO public.empresas (id, nome, nome_completo, nif, sede, licenca_tvde, licenca_validade, representante, cargo_representante, papel_timbrado, ativo)
VALUES
  (
    'decada_ousada',
    'WeGest',
    'WeGest, Lda.',
    '515127850',
    'Rua do Mourato Nº 70 A correio 70, 9600-224 Ribeira Grande',
    '(informação a confirmar)',
    '(informação a confirmar)',
    'Beatriz Veloso',
    'gerente com poderes para o ato',
    '/images/papel-timbrado-rota-liquida.png',
    true
  ),
  (
    'distancia_arrojada',
    'Distância Arrojada',
    'Distância Arrojada, Unipessoal, Lda.',
    '516600800',
    'Largo Ribeiro do Amaral, Nº3, Edifício Interbeiras, 3400-070 Oliveira do Hospital',
    '87314/2021',
    '26/12/2028',
    'Beatriz Veloso',
    'gerente com poderes para o ato',
    '/images/papel-timbrado-distancia-arrojada.png',
    true
  )
ON CONFLICT (id) DO NOTHING;
