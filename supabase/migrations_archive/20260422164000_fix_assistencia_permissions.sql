
-- 1. Garantir que o utilizador atual tem permissão de 'assistencia_tickets'
-- (Isto resolve o problema de os tickets não aparecerem na query)

-- Primeiro, vamos tornar as políticas de assistência mais abertas para Administradores
DROP POLICY IF EXISTS "Criadores podem ver seus tickets" ON public.assistencia_tickets;
CREATE POLICY "Admins e Criadores podem ver tickets"
ON public.assistencia_tickets FOR SELECT
USING (
    is_current_user_admin() 
    OR criado_por = auth.uid() 
    OR has_permission(auth.uid(), 'assistencia_tickets')
    OR has_permission(auth.uid(), 'motoristas_gestao')
);

-- 2. Fazer o mesmo para os Anexos
DROP POLICY IF EXISTS "Ver anexos do ticket" ON public.assistencia_anexos;
CREATE POLICY "Admins e Criadores podem ver anexos"
ON public.assistencia_anexos FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.assistencia_tickets t
        WHERE t.id = ticket_id
        AND (
            is_current_user_admin()
            OR t.criado_por = auth.uid()
            OR has_permission(auth.uid(), 'assistencia_tickets')
            OR has_permission(auth.uid(), 'motoristas_gestao')
        )
    )
);

-- 3. Garantir que o bucket é público (já o fizemos, mas vamos reforçar)
DROP POLICY IF EXISTS "Acesso Público para Ver Anexos" ON storage.objects;
CREATE POLICY "Acesso Público para Ver Anexos" ON storage.objects
  FOR SELECT USING (bucket_id = 'assistencia-anexos');
