-- Criar bucket para armazenar documentos gerados
INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos', 'documentos', false)
ON CONFLICT (id) DO NOTHING;

-- Políticas de acesso ao bucket de documentos
CREATE POLICY "Usuários autenticados podem ver documentos"
ON storage.objects FOR SELECT
USING (bucket_id = 'documentos' AND auth.role() = 'authenticated');

CREATE POLICY "Usuários autenticados podem fazer upload de documentos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'documentos' AND auth.role() = 'authenticated');

CREATE POLICY "Admins podem deletar documentos"
ON storage.objects FOR DELETE
USING (bucket_id = 'documentos' AND is_current_user_admin());

-- Adicionar coluna documento_url na tabela contratos
ALTER TABLE public.contratos
ADD COLUMN IF NOT EXISTS documento_url text;

-- Adicionar coluna template_id na tabela contratos para saber qual template foi usado
ALTER TABLE public.contratos
ADD COLUMN IF NOT EXISTS template_id uuid;