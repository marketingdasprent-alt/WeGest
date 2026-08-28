-- Adicionar coluna tem_formacao_tvde na tabela leads_dasprent
ALTER TABLE leads_dasprent ADD COLUMN IF NOT EXISTS tem_formacao_tvde BOOLEAN DEFAULT NULL;

-- Atualizar leads existentes que não têm licença TVDE
-- Vou usar uma abordagem mais simples para identificar leads sem licença
UPDATE leads_dasprent 
SET campaign_tags = CASE 
  WHEN campaign_tags IS NULL THEN ARRAY['Formação TVDE']
  WHEN NOT ('Formação TVDE' = ANY(campaign_tags)) THEN array_append(campaign_tags, 'Formação TVDE')
  ELSE campaign_tags
END,
tem_formacao_tvde = false
WHERE formulario_id = '3ca5675a-11a6-4e58-9d1f-2f9e53d4e5f0'
  AND observacoes ~ '.*("Não"|Não).*';