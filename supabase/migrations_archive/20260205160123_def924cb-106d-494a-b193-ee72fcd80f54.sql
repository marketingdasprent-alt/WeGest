-- Adicionar coluna is_slot à tabela viaturas
ALTER TABLE viaturas ADD COLUMN is_slot boolean DEFAULT false;