-- Remover tag "TVDE GERAL" de todos os leads que têm "Formação TVDE"
-- Lógica: Se precisa de formação, não pode estar na categoria geral

UPDATE leads_dasprent 
SET campaign_tags = array_remove(campaign_tags, 'TVDE GERAL')
WHERE 'TVDE GERAL' = ANY(campaign_tags) 
  AND 'Formação TVDE' = ANY(campaign_tags);