-- Corrigir políticas RLS da tabela viaturas para usar permissões granulares

-- 1. DROP das políticas existentes
DROP POLICY IF EXISTS "Permissão para ver viaturas" ON viaturas;
DROP POLICY IF EXISTS "Permissão para criar viaturas" ON viaturas;
DROP POLICY IF EXISTS "Permissão para editar viaturas" ON viaturas;
DROP POLICY IF EXISTS "Apenas admins podem deletar viaturas" ON viaturas;

-- 2. Criar novas políticas com permissões corretas

-- SELECT: Pode ver viaturas
CREATE POLICY "Permissão para ver viaturas"
ON viaturas FOR SELECT
TO authenticated
USING (
  is_current_user_admin() 
  OR has_permission(auth.uid(), 'viaturas_ver')
);

-- INSERT: Pode criar viaturas
CREATE POLICY "Permissão para criar viaturas"
ON viaturas FOR INSERT
TO authenticated
WITH CHECK (
  is_current_user_admin() 
  OR has_permission(auth.uid(), 'viaturas_criar')
);

-- UPDATE: Pode editar viaturas
CREATE POLICY "Permissão para editar viaturas"
ON viaturas FOR UPDATE
TO authenticated
USING (
  is_current_user_admin() 
  OR has_permission(auth.uid(), 'viaturas_editar')
);

-- DELETE: Pode eliminar viaturas
CREATE POLICY "Permissão para eliminar viaturas"
ON viaturas FOR DELETE
TO authenticated
USING (
  is_current_user_admin() 
  OR has_permission(auth.uid(), 'viaturas_eliminar')
);