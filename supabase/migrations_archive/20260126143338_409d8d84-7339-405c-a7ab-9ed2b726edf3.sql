-- Tornar o bucket viatura-documentos público
UPDATE storage.buckets 
SET public = true 
WHERE id = 'viatura-documentos';

-- Criar política para acesso público de leitura (anónimo e autenticado)
CREATE POLICY "Acesso público para leitura viatura-documentos"
ON storage.objects FOR SELECT
USING (bucket_id = 'viatura-documentos');

-- Política para upload (apenas autenticados)
CREATE POLICY "Utilizadores autenticados podem fazer upload viatura-documentos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'viatura-documentos');

-- Política para eliminar (apenas autenticados)
CREATE POLICY "Utilizadores autenticados podem eliminar viatura-documentos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'viatura-documentos');