-- Adicionar política RLS para o módulo financeiro ver e editar recibos
-- A permissão financeiro_recibos permite gerir todos os recibos

-- Ver recibos - adicionar permissão financeiro_recibos
DROP POLICY IF EXISTS "Financeiro pode ver motorista_recibos" ON motorista_recibos;
CREATE POLICY "Financeiro pode ver motorista_recibos" 
ON motorista_recibos 
FOR SELECT 
USING (has_permission(auth.uid(), 'financeiro_recibos'));

-- Editar recibos - adicionar permissão financeiro_recibos
DROP POLICY IF EXISTS "Financeiro pode editar motorista_recibos" ON motorista_recibos;
CREATE POLICY "Financeiro pode editar motorista_recibos" 
ON motorista_recibos 
FOR UPDATE 
USING (has_permission(auth.uid(), 'financeiro_recibos'));

-- Ver motoristas_ativos para o dropdown de filtros
DROP POLICY IF EXISTS "Financeiro pode ver motoristas_ativos" ON motoristas_ativos;
CREATE POLICY "Financeiro pode ver motoristas_ativos" 
ON motoristas_ativos 
FOR SELECT 
USING (has_permission(auth.uid(), 'financeiro_recibos'));