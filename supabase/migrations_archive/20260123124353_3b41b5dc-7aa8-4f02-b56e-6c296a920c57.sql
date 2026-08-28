-- Adicionar coluna codigo à tabela motoristas_ativos
ALTER TABLE motoristas_ativos 
ADD COLUMN codigo INTEGER;

-- Criar índice único para garantir unicidade
CREATE UNIQUE INDEX idx_motoristas_ativos_codigo ON motoristas_ativos(codigo);

-- Atribuir códigos aos motoristas existentes por ordem de criação
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) as new_codigo
  FROM motoristas_ativos
)
UPDATE motoristas_ativos m
SET codigo = n.new_codigo
FROM numbered n
WHERE m.id = n.id;

-- Criar sequência para novos códigos (começa após o último existente)
CREATE SEQUENCE IF NOT EXISTS motoristas_codigo_seq START WITH 87;

-- Definir valor padrão para novos registos
ALTER TABLE motoristas_ativos 
ALTER COLUMN codigo SET DEFAULT nextval('motoristas_codigo_seq');

-- Tornar coluna NOT NULL após preenchimento
ALTER TABLE motoristas_ativos 
ALTER COLUMN codigo SET NOT NULL;