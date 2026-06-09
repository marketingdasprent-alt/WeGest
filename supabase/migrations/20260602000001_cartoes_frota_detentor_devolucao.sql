-- Adicionar campos detentor e devolucao à tabela cartoes_frota
ALTER TABLE public.cartoes_frota
  ADD COLUMN IF NOT EXISTS detentor text,
  ADD COLUMN IF NOT EXISTS devolucao text;

COMMENT ON COLUMN public.cartoes_frota.detentor IS 'Nome do detentor/responsável pelo cartão';
COMMENT ON COLUMN public.cartoes_frota.devolucao IS 'Observações sobre a devolução do cartão';
