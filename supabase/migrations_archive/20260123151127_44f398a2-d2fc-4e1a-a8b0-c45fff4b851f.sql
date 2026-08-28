-- FASE 1: Limpeza de contratos duplicados

-- 1. Eliminar contratos sem documento (tentativas falhadas/canceladas)
DELETE FROM contratos 
WHERE documento_url IS NULL;

-- 2. Para cada motorista/empresa, manter apenas o mais recente como ativo
-- Primeiro, identificar os contratos que devem ficar como 'substituido'
WITH ranked_contratos AS (
  SELECT id, 
         motorista_id,
         empresa_id,
         status,
         ROW_NUMBER() OVER (
           PARTITION BY motorista_id, empresa_id 
           ORDER BY criado_em DESC
         ) as rn
  FROM contratos
)
UPDATE contratos 
SET status = 'substituido',
    atualizado_em = now()
WHERE id IN (
  SELECT id FROM ranked_contratos WHERE rn > 1
)
AND status = 'ativo';

-- 3. Garantir que o contrato mais recente de cada motorista/empresa está ativo
WITH most_recent AS (
  SELECT DISTINCT ON (motorista_id, empresa_id) id
  FROM contratos
  ORDER BY motorista_id, empresa_id, criado_em DESC
)
UPDATE contratos 
SET status = 'ativo',
    atualizado_em = now()
WHERE id IN (SELECT id FROM most_recent)
AND status != 'ativo';

-- 4. Resetar versões para valores corretos (1, 2, 3... por ordem cronológica)
WITH versao_correta AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY motorista_id, empresa_id 
           ORDER BY criado_em ASC
         ) as nova_versao
  FROM contratos
)
UPDATE contratos c
SET versao = vc.nova_versao
FROM versao_correta vc
WHERE c.id = vc.id
AND c.versao != vc.nova_versao;