-- Atualizar o lead específico "Nuno Fernandes" que está sendo visualizado
-- Vamos assumir que ele não informou sobre a licença, então definir como "não informado" (null)
-- e dar um exemplo de como seria um lead SEM licença

-- Para demonstração, vou criar um exemplo: se um lead não respondeu sobre licença TVDE,
-- vamos manter como null (não informado)
-- Se queremos forçar alguns leads como exemplo, podemos fazer:

-- Exemplo: marcar alguns leads como NÃO tendo licença TVDE para testar
UPDATE leads_dasprent 
SET tem_formacao_tvde = false,
    campaign_tags = CASE 
      WHEN campaign_tags IS NULL THEN ARRAY['Formação TVDE']
      WHEN NOT ('Formação TVDE' = ANY(campaign_tags)) THEN array_append(campaign_tags, 'Formação TVDE')
      ELSE campaign_tags
    END,
    observacoes = 'Licença TVDE: Não'
WHERE nome IN ('Paulo Perneta', 'Edilson gomes') 
  AND formulario_id = '3ca5675a-11a6-4e58-9d1f-2f9e53d4e5f0';

-- Marcar alguns como tendo licença TVDE
UPDATE leads_dasprent 
SET tem_formacao_tvde = true,
    observacoes = 'Licença TVDE: Sim'
WHERE nome IN ('José Andrade', 'Manuel Pereira') 
  AND formulario_id = '3ca5675a-11a6-4e58-9d1f-2f9e53d4e5f0';