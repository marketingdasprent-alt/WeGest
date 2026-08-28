-- Adicionar campos SLOT à tabela motoristas_ativos
ALTER TABLE public.motoristas_ativos 
ADD COLUMN IF NOT EXISTS is_slot boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS slot_valor_semanal numeric DEFAULT null;

-- Comentários para documentação
COMMENT ON COLUMN public.motoristas_ativos.is_slot IS 'Indica se o motorista é SLOT';
COMMENT ON COLUMN public.motoristas_ativos.slot_valor_semanal IS 'Valor semanal que o motorista paga pelo SLOT (em €)';