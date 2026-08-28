-- Adicionar campos de orçamento e fatura à tabela assistencia_tickets
ALTER TABLE public.assistencia_tickets
  ADD COLUMN IF NOT EXISTS valor_orcamento NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS numero_fatura TEXT,
  ADD COLUMN IF NOT EXISTS fatura_url TEXT;
