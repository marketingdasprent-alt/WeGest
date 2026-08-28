
-- =====================================================
-- SISTEMA DE ASSISTÊNCIA - TICKETS DE REPARAÇÃO
-- =====================================================

-- 1. Tabela de Categorias de Assistência (personalizáveis pelo admin)
CREATE TABLE public.assistencia_categorias (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    nome TEXT NOT NULL,
    descricao TEXT,
    cor TEXT DEFAULT '#3B82F6',
    icone TEXT DEFAULT 'wrench',
    ativo BOOLEAN DEFAULT true,
    ordem INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Tabela principal de Tickets
CREATE TABLE public.assistencia_tickets (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    numero SERIAL,
    viatura_id UUID NOT NULL REFERENCES public.viaturas(id) ON DELETE RESTRICT,
    motorista_id UUID REFERENCES public.motoristas_ativos(id) ON DELETE SET NULL,
    categoria_id UUID REFERENCES public.assistencia_categorias(id) ON DELETE SET NULL,
    titulo TEXT NOT NULL,
    descricao TEXT,
    prioridade TEXT DEFAULT 'media' CHECK (prioridade IN ('baixa', 'media', 'alta', 'urgente')),
    status TEXT DEFAULT 'aberto' CHECK (status IN ('aberto', 'em_andamento', 'aguardando', 'resolvido', 'fechado')),
    criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    atribuido_a UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    data_estimada DATE,
    data_resolucao TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Tabela de Mensagens/Respostas no Ticket
CREATE TABLE public.assistencia_mensagens (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    ticket_id UUID NOT NULL REFERENCES public.assistencia_tickets(id) ON DELETE CASCADE,
    autor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    mensagem TEXT NOT NULL,
    tipo TEXT DEFAULT 'mensagem' CHECK (tipo IN ('mensagem', 'nota_interna', 'status_change')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. Tabela de Anexos
CREATE TABLE public.assistencia_anexos (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    ticket_id UUID NOT NULL REFERENCES public.assistencia_tickets(id) ON DELETE CASCADE,
    mensagem_id UUID REFERENCES public.assistencia_mensagens(id) ON DELETE SET NULL,
    nome_ficheiro TEXT NOT NULL,
    ficheiro_url TEXT NOT NULL,
    tipo_ficheiro TEXT,
    tamanho INTEGER,
    uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =====================================================
-- ÍNDICES PARA PERFORMANCE
-- =====================================================

CREATE INDEX idx_assistencia_tickets_viatura ON public.assistencia_tickets(viatura_id);
CREATE INDEX idx_assistencia_tickets_status ON public.assistencia_tickets(status);
CREATE INDEX idx_assistencia_tickets_criado_por ON public.assistencia_tickets(criado_por);
CREATE INDEX idx_assistencia_tickets_atribuido_a ON public.assistencia_tickets(atribuido_a);
CREATE INDEX idx_assistencia_mensagens_ticket ON public.assistencia_mensagens(ticket_id);
CREATE INDEX idx_assistencia_anexos_ticket ON public.assistencia_anexos(ticket_id);

-- =====================================================
-- TRIGGER PARA UPDATED_AT
-- =====================================================

CREATE TRIGGER update_assistencia_categorias_updated_at
    BEFORE UPDATE ON public.assistencia_categorias
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_assistencia_tickets_updated_at
    BEFORE UPDATE ON public.assistencia_tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- HABILITAR RLS
-- =====================================================

ALTER TABLE public.assistencia_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistencia_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistencia_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistencia_anexos ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- POLÍTICAS RLS - CATEGORIAS
-- =====================================================

-- Todos podem ver categorias ativas
CREATE POLICY "Todos podem ver categorias ativas"
ON public.assistencia_categorias FOR SELECT
USING (ativo = true OR is_current_user_admin());

-- Apenas admins podem gerir categorias
CREATE POLICY "Admins podem gerir categorias"
ON public.assistencia_categorias FOR ALL
USING (is_current_user_admin())
WITH CHECK (is_current_user_admin());

-- =====================================================
-- POLÍTICAS RLS - TICKETS
-- =====================================================

-- Gestores CRM podem criar tickets
CREATE POLICY "Gestores podem criar tickets"
ON public.assistencia_tickets FOR INSERT
WITH CHECK (
    is_current_user_admin() 
    OR has_permission(auth.uid(), 'motoristas_crm')
    OR has_permission(auth.uid(), 'motoristas_gestao')
);

-- Gestores podem ver tickets que criaram
CREATE POLICY "Criadores podem ver seus tickets"
ON public.assistencia_tickets FOR SELECT
USING (
    is_current_user_admin()
    OR criado_por = auth.uid()
    OR has_permission(auth.uid(), 'assistencia_tickets')
);

-- Gestores de assistência podem atualizar qualquer ticket
CREATE POLICY "Gestores assistência podem atualizar tickets"
ON public.assistencia_tickets FOR UPDATE
USING (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'assistencia_tickets')
    OR criado_por = auth.uid()
);

-- Apenas admins podem deletar tickets
CREATE POLICY "Apenas admins podem deletar tickets"
ON public.assistencia_tickets FOR DELETE
USING (is_current_user_admin());

-- =====================================================
-- POLÍTICAS RLS - MENSAGENS
-- =====================================================

-- Quem tem acesso ao ticket pode ver mensagens
CREATE POLICY "Ver mensagens do ticket"
ON public.assistencia_mensagens FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.assistencia_tickets t
        WHERE t.id = ticket_id
        AND (
            is_current_user_admin()
            OR t.criado_por = auth.uid()
            OR has_permission(auth.uid(), 'assistencia_tickets')
        )
    )
);

-- Quem tem acesso ao ticket pode criar mensagens
CREATE POLICY "Criar mensagens no ticket"
ON public.assistencia_mensagens FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.assistencia_tickets t
        WHERE t.id = ticket_id
        AND (
            is_current_user_admin()
            OR t.criado_por = auth.uid()
            OR has_permission(auth.uid(), 'assistencia_tickets')
        )
    )
);

-- =====================================================
-- POLÍTICAS RLS - ANEXOS
-- =====================================================

-- Quem tem acesso ao ticket pode ver anexos
CREATE POLICY "Ver anexos do ticket"
ON public.assistencia_anexos FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.assistencia_tickets t
        WHERE t.id = ticket_id
        AND (
            is_current_user_admin()
            OR t.criado_por = auth.uid()
            OR has_permission(auth.uid(), 'assistencia_tickets')
        )
    )
);

-- Quem tem acesso ao ticket pode criar anexos
CREATE POLICY "Criar anexos no ticket"
ON public.assistencia_anexos FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.assistencia_tickets t
        WHERE t.id = ticket_id
        AND (
            is_current_user_admin()
            OR t.criado_por = auth.uid()
            OR has_permission(auth.uid(), 'assistencia_tickets')
        )
    )
);

-- Apenas admins podem deletar anexos
CREATE POLICY "Apenas admins podem deletar anexos"
ON public.assistencia_anexos FOR DELETE
USING (is_current_user_admin());

-- =====================================================
-- STORAGE BUCKET PARA ANEXOS
-- =====================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('assistencia-anexos', 'assistencia-anexos', false)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage
CREATE POLICY "Ver anexos de assistência"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'assistencia-anexos'
    AND (
        is_current_user_admin()
        OR has_permission(auth.uid(), 'assistencia_tickets')
        OR has_permission(auth.uid(), 'motoristas_crm')
        OR has_permission(auth.uid(), 'motoristas_gestao')
    )
);

CREATE POLICY "Upload anexos de assistência"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'assistencia-anexos'
    AND (
        is_current_user_admin()
        OR has_permission(auth.uid(), 'assistencia_tickets')
        OR has_permission(auth.uid(), 'motoristas_crm')
        OR has_permission(auth.uid(), 'motoristas_gestao')
    )
);

CREATE POLICY "Deletar anexos de assistência"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'assistencia-anexos'
    AND is_current_user_admin()
);

-- =====================================================
-- INSERIR NOVOS RECURSOS
-- =====================================================

INSERT INTO public.recursos (nome, descricao, categoria)
VALUES 
    ('assistencia_tickets', 'Gestão de tickets de assistência e reparações', 'Assistência'),
    ('assistencia_categorias', 'Gestão de categorias de assistência', 'Administração')
ON CONFLICT DO NOTHING;

-- =====================================================
-- CRIAR CARGO "GESTOR DE ASSISTÊNCIA"
-- =====================================================

INSERT INTO public.cargos (nome, descricao)
VALUES ('Gestor de Assistência', 'Responsável por gerir tickets de reparação e assistência de viaturas')
ON CONFLICT DO NOTHING;

-- Atribuir permissão de assistencia_tickets ao novo cargo
INSERT INTO public.cargo_permissoes (cargo_id, recurso_id, tem_acesso)
SELECT 
    c.id as cargo_id,
    r.id as recurso_id,
    true as tem_acesso
FROM public.cargos c
CROSS JOIN public.recursos r
WHERE c.nome = 'Gestor de Assistência'
AND r.nome = 'assistencia_tickets'
ON CONFLICT DO NOTHING;

-- =====================================================
-- INSERIR CATEGORIAS PADRÃO
-- =====================================================

INSERT INTO public.assistencia_categorias (nome, descricao, cor, icone, ordem)
VALUES 
    ('Reparação Motor', 'Problemas relacionados com o motor', '#EF4444', 'engine', 1),
    ('Reparação Travões', 'Problemas com sistema de travagem', '#F97316', 'disc', 2),
    ('Reparação Pneus', 'Substituição ou reparação de pneus', '#84CC16', 'circle', 3),
    ('Reparação Elétrica', 'Problemas elétricos e eletrónicos', '#3B82F6', 'zap', 4),
    ('Reparação Carroçaria', 'Danos na carroçaria e pintura', '#8B5CF6', 'car', 5),
    ('Manutenção Preventiva', 'Revisões e manutenção regular', '#06B6D4', 'settings', 6),
    ('Acidente', 'Sinistros e acidentes', '#DC2626', 'alert-triangle', 7),
    ('Outro', 'Outros tipos de assistência', '#6B7280', 'help-circle', 99)
ON CONFLICT DO NOTHING;
