-- Atualização abrangente de permissões para Assistência (Tickets, Mensagens e Anexos)
-- Garante que o criador, o atribuído, admins e pessoas com acesso explícito podem ver e interagir.

-- 0. Garantir existência da tabela de acessos
CREATE TABLE IF NOT EXISTS public.assistencia_ticket_acessos (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    ticket_id UUID NOT NULL REFERENCES public.assistencia_tickets(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(ticket_id, profile_id)
);

ALTER TABLE public.assistencia_ticket_acessos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso próprio aos registos de acesso" ON public.assistencia_ticket_acessos;
CREATE POLICY "Acesso próprio aos registos de acesso"
ON public.assistencia_ticket_acessos FOR SELECT
USING (profile_id = auth.uid() OR is_current_user_admin());

DROP POLICY IF EXISTS "Admins gerem acessos" ON public.assistencia_ticket_acessos;
CREATE POLICY "Admins gerem acessos"
ON public.assistencia_ticket_acessos FOR ALL
USING (is_current_user_admin());

-- 1. TICKETS
DROP POLICY IF EXISTS "Admins e Criadores podem ver tickets" ON public.assistencia_tickets;
DROP POLICY IF EXISTS "Qualquer um autenticado pode ver tickets" ON public.assistencia_tickets;
DROP POLICY IF EXISTS "Criadores podem ver seus tickets" ON public.assistencia_tickets;

CREATE POLICY "Acesso abrangente para ver tickets"
ON public.assistencia_tickets FOR SELECT
USING (
    is_current_user_admin() 
    OR criado_por = auth.uid() 
    OR atribuido_a = auth.uid()
    OR has_permission(auth.uid(), 'assistencia_tickets')
    OR has_permission(auth.uid(), 'motoristas_gestao')
    OR EXISTS (
        SELECT 1 FROM public.assistencia_ticket_acessos
        WHERE ticket_id = public.assistencia_tickets.id
        AND profile_id = auth.uid()
    )
);

CREATE POLICY "Acesso abrangente para atualizar tickets"
ON public.assistencia_tickets FOR UPDATE
USING (
    is_current_user_admin() 
    OR criado_por = auth.uid() 
    OR atribuido_a = auth.uid()
    OR has_permission(auth.uid(), 'assistencia_tickets')
    OR EXISTS (
        SELECT 1 FROM public.assistencia_ticket_acessos
        WHERE ticket_id = public.assistencia_tickets.id
        AND profile_id = auth.uid()
    )
);

-- 2. MENSAGENS
DROP POLICY IF EXISTS "Ver mensagens do ticket" ON public.assistencia_mensagens;
CREATE POLICY "Acesso abrangente para ver mensagens"
ON public.assistencia_mensagens FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.assistencia_tickets t
        WHERE t.id = ticket_id
        AND (
            is_current_user_admin()
            OR t.criado_por = auth.uid()
            OR t.atribuido_a = auth.uid()
            OR has_permission(auth.uid(), 'assistencia_tickets')
            OR EXISTS (
                SELECT 1 FROM public.assistencia_ticket_acessos
                WHERE ticket_id = t.id
                AND profile_id = auth.uid()
            )
        )
    )
);

DROP POLICY IF EXISTS "Criar mensagens no ticket" ON public.assistencia_mensagens;
CREATE POLICY "Acesso abrangente para criar mensagens"
ON public.assistencia_mensagens FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.assistencia_tickets t
        WHERE t.id = ticket_id
        AND (
            is_current_user_admin()
            OR t.criado_por = auth.uid()
            OR t.atribuido_a = auth.uid()
            OR has_permission(auth.uid(), 'assistencia_tickets')
            OR EXISTS (
                SELECT 1 FROM public.assistencia_ticket_acessos
                WHERE ticket_id = t.id
                AND profile_id = auth.uid()
            )
        )
    )
);

-- 3. ANEXOS
DROP POLICY IF EXISTS "Admins e Criadores podem ver anexos" ON public.assistencia_anexos;
DROP POLICY IF EXISTS "Ver anexos do ticket" ON public.assistencia_anexos;
DROP POLICY IF EXISTS "Ver anexos do ticket - ULTRA PERMISSIVE" ON public.assistencia_anexos;

CREATE POLICY "Acesso abrangente para ver anexos"
ON public.assistencia_anexos FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.assistencia_tickets t
        WHERE t.id = ticket_id
        AND (
            is_current_user_admin()
            OR t.criado_por = auth.uid()
            OR t.atribuido_a = auth.uid()
            OR has_permission(auth.uid(), 'assistencia_tickets')
            OR EXISTS (
                SELECT 1 FROM public.assistencia_ticket_acessos
                WHERE ticket_id = t.id
                AND profile_id = auth.uid()
            )
        )
    )
);

CREATE POLICY "Acesso abrangente para criar anexos"
ON public.assistencia_anexos FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.assistencia_tickets t
        WHERE t.id = ticket_id
        AND (
            is_current_user_admin()
            OR t.criado_por = auth.uid()
            OR t.atribuido_a = auth.uid()
            OR has_permission(auth.uid(), 'assistencia_tickets')
            OR EXISTS (
                SELECT 1 FROM public.assistencia_ticket_acessos
                WHERE ticket_id = t.id
                AND profile_id = auth.uid()
            )
        )
    )
);
