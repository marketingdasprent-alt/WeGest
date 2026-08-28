-- Viatura substituta no ticket de assistência
ALTER TABLE public.assistencia_tickets
  ADD COLUMN IF NOT EXISTS viatura_substituta_id UUID REFERENCES public.viaturas(id);

-- Tipo de associação: 'normal' ou 'substituta'
ALTER TABLE public.motorista_viaturas
  ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'normal';
