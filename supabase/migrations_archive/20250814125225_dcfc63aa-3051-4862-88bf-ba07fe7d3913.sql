-- Limpeza completa das tags - manter apenas "TVDE GERAL" e "Formação TVDE"

-- 1. Remover TODAS as tags não permitidas da tabela formulario_campanhas
DELETE FROM formulario_campanhas 
WHERE campanha_tag NOT IN ('TVDE GERAL', 'Formação TVDE');

-- 2. Atualizar todos os leads para remover tags não permitidas do array campaign_tags
UPDATE leads_dasprent 
SET campaign_tags = ARRAY(
  SELECT tag 
  FROM unnest(campaign_tags) AS tag 
  WHERE tag IN ('TVDE GERAL', 'Formação TVDE')
)
WHERE campaign_tags IS NOT NULL;

-- 3. Definir como array vazio para leads que ficaram sem tags válidas
UPDATE leads_dasprent 
SET campaign_tags = '{}'::text[]
WHERE campaign_tags IS NOT NULL 
  AND cardinality(campaign_tags) = 0;

-- Verificação final
SELECT 'Tags restantes em formulario_campanhas:' as verificacao;
SELECT DISTINCT campanha_tag FROM formulario_campanhas ORDER BY campanha_tag;

SELECT 'Tags restantes nos leads:' as verificacao;
SELECT DISTINCT unnest(campaign_tags) as tag 
FROM leads_dasprent 
WHERE campaign_tags IS NOT NULL AND cardinality(campaign_tags) > 0 
ORDER BY tag;