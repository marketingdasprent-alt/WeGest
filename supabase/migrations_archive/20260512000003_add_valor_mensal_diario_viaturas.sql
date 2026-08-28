-- Adicionar campos de valor mensal e diário para viaturas do tipo Comercial
ALTER TABLE public.viaturas
  ADD COLUMN IF NOT EXISTS valor_mensal numeric(10,2) NULL,
  ADD COLUMN IF NOT EXISTS valor_diario numeric(10,2) NULL;
