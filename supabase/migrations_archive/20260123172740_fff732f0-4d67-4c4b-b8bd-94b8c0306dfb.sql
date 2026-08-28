-- Criar sequência BIGINT para códigos únicos globais (suporta 9+ quintilhões)
CREATE SEQUENCE IF NOT EXISTS motorista_recibos_codigo_seq 
  AS BIGINT 
  START WITH 1 
  INCREMENT BY 1 
  NO MAXVALUE;

-- Adicionar coluna código como BIGINT
ALTER TABLE motorista_recibos 
ADD COLUMN IF NOT EXISTS codigo BIGINT 
DEFAULT nextval('motorista_recibos_codigo_seq');

-- Garantir unicidade global
CREATE UNIQUE INDEX IF NOT EXISTS idx_motorista_recibos_codigo_unique 
ON motorista_recibos(codigo);

-- Popular códigos para recibos existentes (se houver)
UPDATE motorista_recibos 
SET codigo = nextval('motorista_recibos_codigo_seq') 
WHERE codigo IS NULL;

-- Tornar NOT NULL após popular
ALTER TABLE motorista_recibos 
ALTER COLUMN codigo SET NOT NULL;