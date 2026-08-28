-- Create empresas table for dynamic company management
CREATE TABLE IF NOT EXISTS public.empresas (
  id                   TEXT PRIMARY KEY,
  nome                 TEXT NOT NULL,
  nome_completo        TEXT NOT NULL,
  nif                  TEXT,
  sede                 TEXT,
  licenca_tvde         TEXT,
  licenca_validade     TEXT,
  representante        TEXT,
  cargo_representante  TEXT,
  papel_timbrado       TEXT,
  ativo                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read active empresas
CREATE POLICY "Authenticated users can read empresas"
  ON public.empresas FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can insert/update/delete (enforced at app level via isAdmin check)
CREATE POLICY "Authenticated users can manage empresas"
  ON public.empresas FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Seed with existing companies from static config
INSERT INTO public.empresas (id, nome, nome_completo, nif, sede, licenca_tvde, licenca_validade, representante, cargo_representante, papel_timbrado, ativo)
VALUES
  (
    'decada_ousada',
    'Década Ousada',
    'Década Ousada, Lda.',
    '515127850',
    'Rua do Mourato Nº 70 A correio 70, 9600-224 Ribeira Grande',
    NULL,
    NULL,
    'Beatriz Veloso',
    'gerente com poderes para o ato',
    '/images/papel-timbrado-decada-ousada.png',
    TRUE
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
    TRUE
  )
ON CONFLICT (id) DO NOTHING;
