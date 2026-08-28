-- Adicionar coluna cidade na tabela motoristas_ativos
ALTER TABLE motoristas_ativos 
ADD COLUMN cidade text;

COMMENT ON COLUMN motoristas_ativos.cidade IS 'Cidade padrão para assinatura de documentos';