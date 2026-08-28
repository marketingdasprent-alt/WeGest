-- LIMPEZA: Remover informações sobre licença TVDE das observações
-- Essas informações devem usar o campo específico tem_formacao_tvde

-- Limpar observações que foram poluídas com informações sobre licença TVDE
UPDATE leads_dasprent 
SET observacoes = CASE 
  -- Se a observação é APENAS sobre licença TVDE, limpar completamente
  WHEN observacoes ~ '^Licença TVDE:.*\((Inferido|Formulário Formação|Presumido)\)$' THEN ''
  WHEN observacoes = 'Licença TVDE: Não (Formulário Formação)' THEN ''
  WHEN observacoes = 'Licença TVDE: Sim (Inferido)' THEN ''
  WHEN observacoes = 'Licença TVDE: Não (Inferido)' THEN ''
  WHEN observacoes = 'Licença TVDE: Sim (Presumido - outro formulário)' THEN ''
  WHEN observacoes = 'Licença TVDE: Sim (Presumido)' THEN ''
  
  -- Se há outras informações além da licença TVDE, remover apenas a parte da licença
  WHEN observacoes ~ '.*\| Licença TVDE:.*\((Inferido|Formulário Formação|Presumido)\).*' THEN 
    regexp_replace(observacoes, '\s*\|\s*Licença TVDE:.*?\((Inferido|Formulário Formação|Presumido[^)]*)\)', '', 'g')
  
  -- Manter observações que não foram poluídas
  ELSE observacoes
END
WHERE observacoes LIKE '%Licença TVDE%';