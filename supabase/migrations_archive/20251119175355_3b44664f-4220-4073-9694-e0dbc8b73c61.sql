-- 1. PRIMEIRO: Limpar contratos duplicados existentes (manter apenas o mais recente)
WITH contratos_duplicados AS (
  SELECT 
    id,
    motorista_id,
    empresa_id,
    criado_em,
    ROW_NUMBER() OVER (
      PARTITION BY motorista_id, empresa_id 
      ORDER BY criado_em DESC
    ) as rn
  FROM contratos
  WHERE status = 'ativo'
)
UPDATE contratos
SET status = 'substituido'
WHERE id IN (
  SELECT id FROM contratos_duplicados WHERE rn > 1
);

-- 2. DEPOIS: Criar índice único que impede 2 contratos ativos para mesmo motorista+empresa
CREATE UNIQUE INDEX idx_contratos_motorista_empresa_ativo 
ON contratos (motorista_id, empresa_id) 
WHERE status = 'ativo';