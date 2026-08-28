-- Migration to add 'pendente' status to assistencia_tickets
ALTER TABLE public.assistencia_tickets DROP CONSTRAINT IF EXISTS assistencia_tickets_status_check;
ALTER TABLE public.assistencia_tickets ADD CONSTRAINT assistencia_tickets_status_check CHECK (status IN ('pendente', 'aberto', 'em_andamento', 'aguardando', 'resolvido', 'fechado'));
