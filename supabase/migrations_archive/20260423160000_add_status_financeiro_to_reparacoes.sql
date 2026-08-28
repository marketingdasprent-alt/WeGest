
-- Adicionar coluna para rastrear o destino financeiro da reparação
ALTER TABLE public.viatura_reparacoes 
ADD COLUMN IF NOT EXISTS status_financeiro TEXT CHECK (status_financeiro IN ('motorista', 'empresa', 'aberto')) DEFAULT 'aberto';

-- Comentário para documentação
COMMENT ON COLUMN public.viatura_reparacoes.status_financeiro IS 'Define quem assume o custo: motorista, empresa ou se ainda está em aberto.';

-- Atualizar registos existentes com base na coluna antiga cobrar_motorista
UPDATE public.viatura_reparacoes 
SET status_financeiro = CASE 
    WHEN cobrar_motorista = true THEN 'motorista'::TEXT 
    WHEN cobrar_motorista = false THEN 'empresa'::TEXT 
    ELSE 'aberto'::TEXT 
END;
