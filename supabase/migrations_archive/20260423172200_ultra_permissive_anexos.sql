-- Política de segurança ultra permissiva para teste de visibilidade de anexos
DROP POLICY IF EXISTS "Ver anexos do ticket" ON public.assistencia_anexos;
CREATE POLICY "Ver anexos do ticket - ULTRA PERMISSIVE"
ON public.assistencia_anexos FOR SELECT
USING (true);

-- Garantir que o bucket é público mesmo
UPDATE storage.buckets SET public = true WHERE id = 'assistencia-anexos';
