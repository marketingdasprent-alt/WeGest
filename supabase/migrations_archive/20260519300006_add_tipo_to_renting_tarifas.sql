-- Adicionar coluna `tipo` à tabela renting_tarifas
-- Valores: 'renting', 'tvde'

ALTER TABLE public.renting_tarifas
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'renting'
    CHECK (tipo IN ('renting', 'tvde'));

CREATE INDEX IF NOT EXISTS idx_renting_tarifas_tipo ON public.renting_tarifas (org_id, tipo);

COMMENT ON COLUMN public.renting_tarifas.tipo IS 'Tipo de tarifa: renting (aluguer tradicional) ou tvde (transporte individual).';
