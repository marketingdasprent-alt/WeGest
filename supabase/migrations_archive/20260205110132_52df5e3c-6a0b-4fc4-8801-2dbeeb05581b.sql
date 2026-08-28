-- Remover políticas RESTRICTIVE existentes
DROP POLICY IF EXISTS "Financeiro pode ver motorista_recibos" ON motorista_recibos;
DROP POLICY IF EXISTS "Motoristas podem ver seus recibos" ON motorista_recibos;
DROP POLICY IF EXISTS "Permissão para ver motorista_recibos" ON motorista_recibos;
DROP POLICY IF EXISTS "Financeiro pode editar motorista_recibos" ON motorista_recibos;
DROP POLICY IF EXISTS "Permissão para editar motorista_recibos" ON motorista_recibos;

-- Recriar como PERMISSIVE (padrão) com lógica unificada
CREATE POLICY "Permissão para ver motorista_recibos" ON motorista_recibos
FOR SELECT USING (
  is_current_user_admin() OR 
  has_permission(auth.uid(), 'motoristas_gestao') OR
  has_permission(auth.uid(), 'financeiro_recibos') OR
  auth.uid() = user_id
);

CREATE POLICY "Permissão para editar motorista_recibos" ON motorista_recibos
FOR UPDATE USING (
  is_current_user_admin() OR 
  has_permission(auth.uid(), 'motoristas_gestao') OR
  has_permission(auth.uid(), 'financeiro_recibos')
);