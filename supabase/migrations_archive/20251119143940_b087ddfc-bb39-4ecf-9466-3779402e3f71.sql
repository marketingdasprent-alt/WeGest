-- Limpar contratos duplicados: manter apenas o mais recente como ativo por motorista+empresa
WITH ranked_contratos AS (
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
  SELECT id 
  FROM ranked_contratos 
  WHERE rn > 1
);

-- Recalcular versões corretamente baseado na ordem cronológica
WITH versioned_contratos AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY motorista_id, empresa_id 
      ORDER BY criado_em ASC
    ) as nova_versao
  FROM contratos
)
UPDATE contratos c
SET versao = vc.nova_versao
FROM versioned_contratos vc
WHERE c.id = vc.id;