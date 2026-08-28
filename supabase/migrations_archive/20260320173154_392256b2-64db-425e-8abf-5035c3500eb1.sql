UPDATE motoristas_ativos 
SET status_ativo = false, updated_at = NOW() 
WHERE status_ativo = true 
AND (gestor_responsavel IS NULL OR gestor_responsavel = '');