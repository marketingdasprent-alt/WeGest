-- Limpar contratos duplicados: manter apenas o mais recente ativo por motorista/empresa
-- Os duplicados serão marcados como 'substituido' (não deletados, para manter histórico)

WITH ranked_contratos AS (
  SELECT 
    id,
    motorista_id,
    empresa_id,
    status,
    criado_em,
    ROW_NUMBER() OVER (
      PARTITION BY motorista_id, empresa_id 
      ORDER BY criado_em DESC
    ) as rn
  FROM contratos
  WHERE status = 'ativo'
)
UPDATE contratos 
SET status = 'substituido',
    atualizado_em = now()
WHERE id IN (
  SELECT id FROM ranked_contratos WHERE rn > 1
);