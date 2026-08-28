ALTER TABLE public.cartoes_frota
  ADD COLUMN IF NOT EXISTS limite     numeric(10,2),
  ADD COLUMN IF NOT EXISTS pin        text,
  ADD COLUMN IF NOT EXISTS ambito     text,
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cartoes_frota_cliente ON public.cartoes_frota (cliente_id);
