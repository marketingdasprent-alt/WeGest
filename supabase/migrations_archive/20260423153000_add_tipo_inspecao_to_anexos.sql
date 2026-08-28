-- Adicionar coluna para diferenciar anexos de check-in e check-out
ALTER TABLE public.assistencia_anexos 
ADD COLUMN IF NOT EXISTS tipo_inspecao TEXT CHECK (tipo_inspecao IN ('checkin', 'checkout')),
ADD COLUMN IF NOT EXISTS legenda TEXT;

-- Comentário para documentação
COMMENT ON COLUMN public.assistencia_anexos.tipo_inspecao IS 'Contexto da imagem: entrada (checkin) ou saída (checkout) da oficina';
COMMENT ON COLUMN public.assistencia_anexos.legenda IS 'Legenda ou descrição da imagem';

-- Atualizar registos existentes com base no texto da mensagem ou descrição se possível
UPDATE public.assistencia_anexos 
SET tipo_inspecao = 'checkin' 
WHERE tipo_inspecao IS NULL;

-- 4. Permitir UPDATE para Admins e Gestores
DROP POLICY IF EXISTS "Admins e Gestores podem editar anexos" ON public.assistencia_anexos;
CREATE POLICY "Admins e Gestores podem editar anexos"
ON public.assistencia_anexos FOR UPDATE
USING (
    is_current_user_admin() 
    OR has_permission(auth.uid(), 'assistencia_tickets')
)
WITH CHECK (
    is_current_user_admin() 
    OR has_permission(auth.uid(), 'assistencia_tickets')
);
