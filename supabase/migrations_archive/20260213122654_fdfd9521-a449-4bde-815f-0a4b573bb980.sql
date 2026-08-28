
-- 1. Limpar mapeamentos antigos para evitar erros de FK
UPDATE bolt_drivers SET motorista_id = NULL;
UPDATE bolt_vehicles SET viatura_id = NULL;

-- 2. Eliminar motoristas do sync antigo (CASCADE apaga contratos e motorista_viaturas)
DELETE FROM motoristas_ativos 
WHERE observacoes ILIKE '%sincronização Bolt%';

-- 3. Eliminar viaturas do sync antigo (CASCADE apaga documentos, danos, etc.)
DELETE FROM viaturas 
WHERE observacoes ILIKE '%sincronização Bolt%';

-- 4. Limpar tabelas bolt intermediárias para começar do zero
TRUNCATE bolt_drivers CASCADE;
TRUNCATE bolt_vehicles CASCADE;
TRUNCATE bolt_mapeamento_motoristas CASCADE;
