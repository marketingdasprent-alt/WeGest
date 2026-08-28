-- Adicionar campo Cartão Frota à tabela de motoristas
ALTER TABLE motoristas_ativos 
ADD COLUMN cartao_frota text;

COMMENT ON COLUMN motoristas_ativos.cartao_frota IS 'Número do cartão frota do motorista';