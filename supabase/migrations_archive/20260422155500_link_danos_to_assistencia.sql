
-- Adicionar referência de ticket na tabela de danos para rastreabilidade
ALTER TABLE public.viatura_danos 
ADD COLUMN IF NOT EXISTS ticket_id UUID REFERENCES public.assistencia_tickets(id) ON DELETE SET NULL;

-- Índice para performance
CREATE INDEX IF NOT EXISTS idx_viatura_danos_ticket ON public.viatura_danos(ticket_id);

COMMENT ON COLUMN public.viatura_danos.ticket_id IS 'ID da assistência que originou ou detetou este dano';
