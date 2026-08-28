-- Adicionar campo valor_aluguer à tabela viaturas
ALTER TABLE viaturas 
ADD COLUMN valor_aluguer numeric DEFAULT null;