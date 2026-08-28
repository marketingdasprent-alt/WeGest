-- Limpeza de tags: manter apenas "TVDE GERAL" e "Formação TVDE"

-- 1. Remover tags desnecessárias da tabela formulario_campanhas
DELETE FROM formulario_campanhas 
WHERE campanha_tag NOT IN ('TVDE GERAL', 'Formação TVDE');

-- 2. Limpar campaign_tags dos leads, mantendo apenas as tags permitidas
UPDATE leads_dasprent 
SET campaign_tags = (
  SELECT ARRAY(
    SELECT unnest(campaign_tags) 
    WHERE unnest(campaign_tags) IN ('TVDE GERAL', 'Formação TVDE')
  )
)
WHERE campaign_tags IS NOT NULL;

-- 3. Definir campaign_tags como array vazio para leads que ficaram sem tags válidas
UPDATE leads_dasprent 
SET campaign_tags = '{}'
WHERE campaign_tags IS NOT NULL 
  AND (
    array_length(campaign_tags, 1) IS NULL 
    OR array_length(campaign_tags, 1) = 0
  );

-- Verificar o resultado
SELECT 'Tags restantes na tabela formulario_campanhas:' as info;
SELECT DISTINCT campanha_tag FROM formulario_campanhas ORDER BY campanha_tag;

SELECT 'Tags restantes nos leads:' as info;
SELECT DISTINCT unnest(campaign_tags) as tag 
FROM leads_dasprent 
WHERE campaign_tags IS NOT NULL AND array_length(campaign_tags, 1) > 0 
ORDER BY tag;