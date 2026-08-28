-- Adicionar coluna recibo_verde à tabela motoristas_ativos
-- Define se o motorista emite recibo verde (afeta cálculo do valor líquido)
ALTER TABLE motoristas_ativos 
ADD COLUMN recibo_verde boolean DEFAULT true;

-- Comentário para documentação
COMMENT ON COLUMN motoristas_ativos.recibo_verde IS 'Indica se o motorista emite recibo verde. Verde (true): valor integral. Vermelho (false): valor ÷ 1.06';