-- Adicionar novo recurso para gestão de templates de documentos
INSERT INTO public.recursos (nome, categoria, descricao)
VALUES (
  'admin_documentos',
  'Admin',
  'Gestão de Templates de Documentos'
)
ON CONFLICT (nome) DO NOTHING;

-- Atualizar políticas RLS da tabela document_templates
DROP POLICY IF EXISTS "Apenas admins podem criar templates" ON public.document_templates;
DROP POLICY IF EXISTS "Apenas admins podem editar templates" ON public.document_templates;
DROP POLICY IF EXISTS "Apenas admins podem deletar templates" ON public.document_templates;

CREATE POLICY "Permissão para criar templates"
ON public.document_templates
FOR INSERT
TO authenticated
WITH CHECK (
  is_current_user_admin() OR 
  has_permission(auth.uid(), 'admin_documentos')
);

CREATE POLICY "Permissão para editar templates"
ON public.document_templates
FOR UPDATE
TO authenticated
USING (
  is_current_user_admin() OR 
  has_permission(auth.uid(), 'admin_documentos')
);

CREATE POLICY "Permissão para deletar templates"
ON public.document_templates
FOR DELETE
TO authenticated
USING (
  is_current_user_admin() OR 
  has_permission(auth.uid(), 'admin_documentos')
);