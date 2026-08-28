-- Adicionar coluna para armazenar a data de início da semana de referência
ALTER TABLE public.motorista_recibos 
ADD COLUMN semana_referencia_inicio DATE;

-- Criar índice para melhorar performance nas buscas
CREATE INDEX idx_motorista_recibos_semana ON public.motorista_recibos(motorista_id, semana_referencia_inicio);

-- Adicionar constraint para impedir duplicados (um recibo por semana por motorista)
ALTER TABLE public.motorista_recibos 
ADD CONSTRAINT unique_motorista_semana UNIQUE (motorista_id, semana_referencia_inicio);

-- Comentário explicativo
COMMENT ON COLUMN public.motorista_recibos.semana_referencia_inicio IS 'Data da segunda-feira da semana a que o recibo se refere';