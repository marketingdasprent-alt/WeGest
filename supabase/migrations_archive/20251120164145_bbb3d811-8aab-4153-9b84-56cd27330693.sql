-- Inserir recurso motoristas_contratos
INSERT INTO recursos (nome, descricao, categoria)
VALUES (
  'motoristas_contratos',
  'Gestão de Contratos - ver, criar, editar, reimprimir contratos',
  'motoristas'
);

-- RLS Policies para Storage Bucket document-templates
-- Permitir visualização pública
CREATE POLICY "Qualquer um pode ver papel timbrado"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'document-templates');

-- Permitir upload para admins e usuários com permissão admin_documentos
CREATE POLICY "Admins e gestores documentos podem fazer upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'document-templates' 
  AND (
    is_current_user_admin() 
    OR has_permission(auth.uid(), 'admin_documentos'::text)
  )
);

-- Permitir delete para admins e usuários com permissão admin_documentos
CREATE POLICY "Admins e gestores documentos podem deletar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'document-templates' 
  AND (
    is_current_user_admin() 
    OR has_permission(auth.uid(), 'admin_documentos'::text)
  )
);

-- Permitir update para admins e usuários com permissão admin_documentos
CREATE POLICY "Admins e gestores documentos podem atualizar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'document-templates' 
  AND (
    is_current_user_admin() 
    OR has_permission(auth.uid(), 'admin_documentos'::text)
  )
);