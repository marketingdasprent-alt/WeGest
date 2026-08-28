
-- Criar bucket para anexos de assistência se não existir
INSERT INTO storage.buckets (id, name, public)
VALUES ('assistencia-anexos', 'assistencia-anexos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Permitir acesso público para ver as fotos (necessário para a página da viatura)
CREATE POLICY "Acesso Público para Ver Anexos" ON storage.objects
  FOR SELECT USING (bucket_id = 'assistencia-anexos');

-- Permitir utilizadores autenticados fazer upload
CREATE POLICY "Utilizadores Autenticados podem Upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'assistencia-anexos' AND 
    auth.role() = 'authenticated'
  );

-- Permitir utilizadores autenticados apagar os seus próprios uploads
CREATE POLICY "Utilizadores podem Apagar Anexos" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'assistencia-anexos' AND 
    auth.role() = 'authenticated'
  );
