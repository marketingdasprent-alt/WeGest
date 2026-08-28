
-- Adicionar novas colunas para detalhamento do estado da viatura na entrada
ALTER TABLE public.assistencia_tickets 
ADD COLUMN IF NOT EXISTS adblue_nivel TEXT,
ADD COLUMN IF NOT EXISTS gpl_qtd NUMERIC,
ADD COLUMN IF NOT EXISTS eletricidade_qtd NUMERIC,
ADD COLUMN IF NOT EXISTS estado_limpeza TEXT;

-- Comentários para documentação
COMMENT ON COLUMN public.assistencia_tickets.adblue_nivel IS 'Nível de AdBlue no check-in';
COMMENT ON COLUMN public.assistencia_tickets.gpl_qtd IS 'Quantidade/Percentagem de GPL no check-in';
COMMENT ON COLUMN public.assistencia_tickets.eletricidade_qtd IS 'Percentagem de bateria no check-in';
COMMENT ON COLUMN public.assistencia_tickets.estado_limpeza IS 'Estado de limpeza da viatura na entrada';
