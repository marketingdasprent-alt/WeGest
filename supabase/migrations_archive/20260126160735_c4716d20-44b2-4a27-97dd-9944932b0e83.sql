-- 1. Remover políticas antigas
DROP POLICY IF EXISTS "Permissão para upload viatura-documentos" ON storage.objects;
DROP POLICY IF EXISTS "Permissão para update viatura-documentos" ON storage.objects;
DROP POLICY IF EXISTS "Permissão para delete viatura-documentos" ON storage.objects;

-- 2. Criar novas políticas com a permissão correcta (viaturas_editar em vez de motoristas_gestao)
CREATE POLICY "Permissão para upload viatura-documentos"
ON storage.objects FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'viatura-documentos' 
  AND (
    is_current_user_admin() 
    OR has_permission(auth.uid(), 'viaturas_editar')
  )
);

CREATE POLICY "Permissão para update viatura-documentos"
ON storage.objects FOR UPDATE
TO public
USING (
  bucket_id = 'viatura-documentos' 
  AND (
    is_current_user_admin() 
    OR has_permission(auth.uid(), 'viaturas_editar')
  )
);

CREATE POLICY "Permissão para delete viatura-documentos"
ON storage.objects FOR DELETE
TO public
USING (
  bucket_id = 'viatura-documentos' 
  AND (
    is_current_user_admin() 
    OR has_permission(auth.uid(), 'viaturas_editar')
  )
);