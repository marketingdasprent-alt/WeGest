-- Remover políticas problemáticas
DROP POLICY IF EXISTS "Permissão para ver leads" ON leads_dasprent;
DROP POLICY IF EXISTS "Permissão para editar leads" ON leads_dasprent;

-- Nova política: Gestores veem apenas leads disponíveis (sem atribuição) ou seus próprios
CREATE POLICY "Gestores veem apenas leads disponíveis ou seus"
ON leads_dasprent
FOR SELECT
TO authenticated
USING (
  -- Admins veem tudo
  is_current_user_admin() 
  OR 
  -- Gestores TVDE veem:
  -- 1) Leads SEM gestor (disponíveis para todos)
  -- 2) Leads atribuídos a eles
  (
    has_permission(auth.uid(), 'motoristas_crm'::text)
    AND (
      gestor_responsavel IS NULL 
      OR gestor_responsavel = '' 
      OR EXISTS (
        SELECT 1 FROM profiles p 
        WHERE p.id = auth.uid() 
        AND p.nome = leads_dasprent.gestor_responsavel
      )
    )
  )
);

-- Nova política: Gestores editam apenas seus próprios leads
CREATE POLICY "Gestores editam apenas seus leads"
ON leads_dasprent
FOR UPDATE
TO authenticated
USING (
  is_current_user_admin() 
  OR (
    has_permission(auth.uid(), 'motoristas_crm'::text) 
    AND EXISTS (
      SELECT 1 FROM profiles p 
      WHERE p.id = auth.uid() 
      AND p.nome = leads_dasprent.gestor_responsavel
    )
  )
)
WITH CHECK (
  is_current_user_admin() 
  OR (
    has_permission(auth.uid(), 'motoristas_crm'::text) 
    AND EXISTS (
      SELECT 1 FROM profiles p 
      WHERE p.id = auth.uid() 
      AND p.nome = leads_dasprent.gestor_responsavel
    )
  )
);