-- Adicionar coluna tipo para distinguir recibos de relatórios
ALTER TABLE public.motorista_recibos ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'recibo';

-- Atualizar relatórios existentes baseados na descrição
UPDATE public.motorista_recibos 
SET tipo = 'relatorio', status = 'validado'
WHERE descricao ILIKE '%Resumo Financeiro%';

-- Atualizar política de RLS para permitir que motoristas vejam relatórios enviados pela administração
DROP POLICY IF EXISTS "Motoristas podem ver seus recibos" ON public.motorista_recibos;

CREATE POLICY "Motoristas podem ver seus recibos e relatorios"
ON public.motorista_recibos
FOR SELECT
USING (
  auth.uid() = user_id 
  OR 
  motorista_id IN (SELECT id FROM public.motoristas_ativos WHERE user_id = auth.uid())
);

-- Atualizar políticas de Storage para permitir que motoristas vejam relatórios na sua pasta
DROP POLICY IF EXISTS "Motoristas podem ver seus recibos" ON storage.objects;

CREATE POLICY "Motoristas podem ver seus recibos e relatorios"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'motorista-recibos' 
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR 
    EXISTS (
      SELECT 1 FROM public.motoristas_ativos 
      WHERE id::text = (storage.foldername(name))[1] 
      AND user_id = auth.uid()
    )
  )
);
