CREATE POLICY "Admins e gestores podem inserir documentos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'document-templates'
  AND (is_current_user_admin() OR has_permission(auth.uid(), 'admin_documentos'))
);