-- Adicionar novos campos para gerenciamento avançado de leads
ALTER TABLE public.leads_dasprent 
ADD COLUMN valor_negocio TEXT,
ADD COLUMN gestor_responsavel TEXT;