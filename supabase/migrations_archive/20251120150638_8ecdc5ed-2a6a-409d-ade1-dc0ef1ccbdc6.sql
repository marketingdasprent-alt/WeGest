-- Criar função auxiliar para verificar se usuário é admin (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_storage_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;

-- Garantir que a função pode ser executada por usuários autenticados
GRANT EXECUTE ON FUNCTION public.is_storage_admin() TO authenticated;

-- Remover políticas antigas do bucket document-templates
DROP POLICY IF EXISTS "Admins podem fazer upload de papéis timbrados" ON storage.objects;
DROP POLICY IF EXISTS "Admins podem atualizar papéis timbrados" ON storage.objects;
DROP POLICY IF EXISTS "Admins podem deletar papéis timbrados" ON storage.objects;

-- Recriar políticas usando a função SECURITY DEFINER
CREATE POLICY "Admins podem fazer upload de papéis timbrados"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'document-templates' 
  AND public.is_storage_admin() = true
);

CREATE POLICY "Admins podem atualizar papéis timbrados"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'document-templates' 
  AND public.is_storage_admin() = true
);

CREATE POLICY "Admins podem deletar papéis timbrados"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'document-templates' 
  AND public.is_storage_admin() = true
);