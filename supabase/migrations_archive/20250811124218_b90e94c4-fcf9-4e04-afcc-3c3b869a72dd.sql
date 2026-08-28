-- Limpar os últimos leads que ainda têm informações sobre licença TVDE nas observações
UPDATE leads_dasprent 
SET observacoes = ''
WHERE observacoes LIKE '%Licença TVDE%';