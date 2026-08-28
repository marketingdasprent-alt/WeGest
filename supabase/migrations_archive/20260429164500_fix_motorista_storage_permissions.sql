-- Fix storage permissions for motorista-documentos bucket
-- Only motoristas could upload before. Now admins and managers can too.

-- 1. Insert permission for Admins and Managers
DROP POLICY IF EXISTS "Admins e Gestores podem fazer upload de documentos de motoristas" ON storage.objects;
CREATE POLICY "Admins e Gestores podem fazer upload de documentos de motoristas"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'motorista-documentos' 
  AND (
    public.is_current_user_admin() 
    OR public.has_permission(auth.uid(), 'motoristas_gestao')
    OR public.has_permission(auth.uid(), 'motoristas_editar')
  )
);

-- 2. Update permission for Admins and Managers
DROP POLICY IF EXISTS "Admins e Gestores podem atualizar documentos de motoristas" ON storage.objects;
CREATE POLICY "Admins e Gestores podem atualizar documentos de motoristas"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'motorista-documentos' 
  AND (
    public.is_current_user_admin() 
    OR public.has_permission(auth.uid(), 'motoristas_gestao')
    OR public.has_permission(auth.uid(), 'motoristas_editar')
  )
);

-- 3. Delete permission for Admins and Managers
DROP POLICY IF EXISTS "Admins e Gestores podem eliminar documentos de motoristas" ON storage.objects;
CREATE POLICY "Admins e Gestores podem eliminar documentos de motoristas"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'motorista-documentos' 
  AND (
    public.is_current_user_admin() 
    OR public.has_permission(auth.uid(), 'motoristas_gestao')
    OR public.has_permission(auth.uid(), 'motoristas_editar')
  )
);

-- Also fix motorista-recibos while we are at it
DROP POLICY IF EXISTS "Admins e Gestores podem fazer upload de recibos" ON storage.objects;
CREATE POLICY "Admins e Gestores podem fazer upload de recibos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'motorista-recibos' 
  AND (
    public.is_current_user_admin() 
    OR public.has_permission(auth.uid(), 'motoristas_gestao')
    OR public.has_permission(auth.uid(), 'financeiro_recibos')
  )
);

DROP POLICY IF EXISTS "Admins e Gestores podem atualizar recibos" ON storage.objects;
CREATE POLICY "Admins e Gestores podem atualizar recibos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'motorista-recibos' 
  AND (
    public.is_current_user_admin() 
    OR public.has_permission(auth.uid(), 'motoristas_gestao')
    OR public.has_permission(auth.uid(), 'financeiro_recibos')
  )
);

DROP POLICY IF EXISTS "Admins e Gestores podem eliminar recibos" ON storage.objects;
CREATE POLICY "Admins e Gestores podem eliminar recibos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'motorista-recibos' 
  AND (
    public.is_current_user_admin() 
    OR public.has_permission(auth.uid(), 'motoristas_gestao')
    OR public.has_permission(auth.uid(), 'financeiro_recibos')
  )
);
