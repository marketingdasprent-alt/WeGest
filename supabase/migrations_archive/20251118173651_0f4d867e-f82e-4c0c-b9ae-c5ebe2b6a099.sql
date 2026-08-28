-- Adicionar coluna para armazenar URL do papel timbrado
ALTER TABLE document_templates 
ADD COLUMN papel_timbrado_url text;

-- Criar bucket para armazenar imagens de papel timbrado
INSERT INTO storage.buckets (id, name, public)
VALUES ('document-templates', 'document-templates', true)
ON CONFLICT (id) DO NOTHING;

-- Política para permitir leitura pública das imagens
CREATE POLICY "Permitir leitura pública de papéis timbrados"
ON storage.objects FOR SELECT
USING (bucket_id = 'document-templates');

-- Política para admins fazerem upload
CREATE POLICY "Admins podem fazer upload de papéis timbrados"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'document-templates' AND
  (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
);

-- Política para admins atualizarem
CREATE POLICY "Admins podem atualizar papéis timbrados"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'document-templates' AND
  (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
);

-- Política para admins deletarem
CREATE POLICY "Admins podem deletar papéis timbrados"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'document-templates' AND
  (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
);