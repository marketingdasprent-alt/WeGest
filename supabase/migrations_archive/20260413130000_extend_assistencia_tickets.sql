
-- Adicionar colunas para fluxo de assistência completo na tabela assistencia_tickets
ALTER TABLE public.assistencia_tickets 
ADD COLUMN IF NOT EXISTS km_inicio INTEGER,
ADD COLUMN IF NOT EXISTS km_fim INTEGER,
ADD COLUMN IF NOT EXISTS combustivel_inicio TEXT,
ADD COLUMN IF NOT EXISTS combustivel_fim TEXT,
ADD COLUMN IF NOT EXISTS valor_reparacao DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS cobrar_motorista BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS reparacao_id UUID REFERENCES public.viatura_reparacoes(id) ON DELETE SET NULL;

-- Comentários nas colunas para documentação
COMMENT ON COLUMN public.assistencia_tickets.km_inicio IS 'Quilometragem da viatura no início da assistência';
COMMENT ON COLUMN public.assistencia_tickets.km_fim IS 'Quilometragem da viatura na conclusão da assistência';
COMMENT ON COLUMN public.assistencia_tickets.combustivel_inicio IS 'Nível de combustível no início';
COMMENT ON COLUMN public.assistencia_tickets.combustivel_fim IS 'Nível de combustível na conclusão';
COMMENT ON COLUMN public.assistencia_tickets.valor_reparacao IS 'Valor total da reparação';
COMMENT ON COLUMN public.assistencia_tickets.cobrar_motorista IS 'Se o valor deve ser debitado ao motorista';
COMMENT ON COLUMN public.assistencia_tickets.reparacao_id IS 'Referência à tabela de reparações financeira';
