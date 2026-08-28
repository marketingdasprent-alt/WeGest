-- Adicionar colunas em falta na tabela motorista_candidaturas
-- O formulário de candidatura (CandidaturaFormulario.tsx) grava estes campos,
-- mas as colunas nunca foram criadas, causando erro ao guardar/submeter:
--   "Could not find the 'carta_conducao_verso_url' column ... in the schema cache"

ALTER TABLE public.motorista_candidaturas
  ADD COLUMN IF NOT EXISTS carta_conducao_verso_url TEXT,
  ADD COLUMN IF NOT EXISTS documento_identificacao_verso_url TEXT,
  ADD COLUMN IF NOT EXISTS codigo_postal TEXT;
