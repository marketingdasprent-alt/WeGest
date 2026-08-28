-- Corrigir políticas RLS da tabela contratos para usar motoristas_gestao

-- 1. Remover políticas RLS existentes
DROP POLICY IF EXISTS "Permissão para criar contratos" ON contratos;
DROP POLICY IF EXISTS "Permissão para editar contratos" ON contratos;
DROP POLICY IF EXISTS "Permissão para ver contratos" ON contratos;

-- 2. Criar novas políticas com o recurso correto (motoristas_gestao)
CREATE POLICY "Permissão para criar contratos" ON contratos
  FOR INSERT
  WITH CHECK (
    is_current_user_admin() 
    OR has_permission(auth.uid(), 'motoristas_gestao'::text)
  );

CREATE POLICY "Permissão para editar contratos" ON contratos
  FOR UPDATE
  USING (
    is_current_user_admin() 
    OR has_permission(auth.uid(), 'motoristas_gestao'::text)
  );

CREATE POLICY "Permissão para ver contratos" ON contratos
  FOR SELECT
  USING (
    is_current_user_admin() 
    OR has_permission(auth.uid(), 'motoristas_gestao'::text)
  );