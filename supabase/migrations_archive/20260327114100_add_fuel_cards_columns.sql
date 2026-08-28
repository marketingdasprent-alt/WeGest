-- Adicionar colunas específicas para diferentes cartões frota
ALTER TABLE public.motoristas_ativos 
  ADD COLUMN IF NOT EXISTS cartao_bp TEXT,
  ADD COLUMN IF NOT EXISTS cartao_repsol TEXT,
  ADD COLUMN IF NOT EXISTS cartao_edp TEXT;

-- Comentários para documentação
COMMENT ON COLUMN public.motoristas_ativos.cartao_bp IS 'Número do cartão de frota BP';
COMMENT ON COLUMN public.motoristas_ativos.cartao_repsol IS 'Número do cartão de frota Repsol';
COMMENT ON COLUMN public.motoristas_ativos.cartao_edp IS 'Número do cartão de frota EDP';
